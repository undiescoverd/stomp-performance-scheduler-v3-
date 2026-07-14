import { api, APIError } from "encore.dev/api";
import { getAuthData } from "encore.dev/internal/codegen/auth";
import type { AuthData } from "../auth/encore_auth";
import { scheduleDB } from "./db";
import { Template, TemplateSlot } from "./types";

export interface ListTemplatesResponse {
  templates: Template[];
}

export interface CreateTemplateRequest {
  name: string;
  slots: TemplateSlot[];
}

export interface UpdateTemplateRequest {
  id: string;
  name?: string;
  slots?: TemplateSlot[];
}

export interface TemplateResponse {
  template: Template;
}

// slots is a jsonb column written as JSON.stringify(slots) (mirroring
// shows_data), so it stores a JSON *string scalar*. Read defensively: the
// column's DEFAULT '[]' would come back as a native array if a row were ever
// inserted without slots, and JSON.parse on an array throws.
function parseSlots(raw: unknown): TemplateSlot[] {
  if (Array.isArray(raw)) return raw as TemplateSlot[];
  if (typeof raw === "string") return JSON.parse(raw) as TemplateSlot[];
  return [];
}

// Lists the authenticated user's templates, most-recently-updated first.
export const listTemplates = api<void, ListTemplatesResponse>(
  { expose: true, method: "GET", path: "/templates", auth: true },
  async () => {
    const authData = await getAuthData<AuthData>();
    const userId = authData?.userID ?? "system";

    const rows = await scheduleDB.queryAll`
      SELECT id, name, slots
      FROM templates
      WHERE user_id = ${userId}
      ORDER BY updated_at DESC
    `;

    const templates: Template[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      slots: parseSlots(row.slots),
    }));

    return { templates };
  }
);

// Creates a template owned by the authenticated user. Slots are stored verbatim.
export const createTemplate = api<CreateTemplateRequest, TemplateResponse>(
  { expose: true, method: "POST", path: "/templates", auth: true },
  async (req) => {
    const authData = await getAuthData<AuthData>();
    const userId = authData?.userID ?? "system";

    const id = generateId();
    const now = new Date();

    await scheduleDB.exec`
      INSERT INTO templates (id, user_id, name, slots, created_at, updated_at)
      VALUES (${id}, ${userId}, ${req.name}, ${JSON.stringify(req.slots)}, ${now}, ${now})
    `;

    return { template: { id, name: req.name, slots: req.slots } };
  }
);

// Updates a template in place (rename and/or reshape). Scoped to the owner: a
// template belonging to another user reads as not-found.
export const updateTemplate = api<UpdateTemplateRequest, TemplateResponse>(
  { expose: true, method: "PUT", path: "/templates/:id", auth: true },
  async (req) => {
    const authData = await getAuthData<AuthData>();
    const userId = authData?.userID ?? "system";

    const existing = await scheduleDB.queryRow`
      SELECT id, name, slots
      FROM templates
      WHERE id = ${req.id} AND user_id = ${userId}
    `;
    if (!existing) {
      throw APIError.notFound("template not found");
    }

    const name = req.name ?? existing.name;
    const slots = req.slots ?? parseSlots(existing.slots);
    const now = new Date();

    await scheduleDB.exec`
      UPDATE templates
      SET name = ${name}, slots = ${JSON.stringify(slots)}, updated_at = ${now}
      WHERE id = ${req.id} AND user_id = ${userId}
    `;

    return { template: { id: req.id, name, slots } };
  }
);

// Deletes a template owned by the authenticated user.
export const deleteTemplate = api<{ id: string }, void>(
  { expose: true, method: "DELETE", path: "/templates/:id", auth: true },
  async (req) => {
    const authData = await getAuthData<AuthData>();
    const userId = authData?.userID ?? "system";

    const existing = await scheduleDB.queryRow`
      SELECT id FROM templates WHERE id = ${req.id} AND user_id = ${userId}
    `;
    if (!existing) {
      throw APIError.notFound("template not found");
    }

    await scheduleDB.exec`
      DELETE FROM templates WHERE id = ${req.id} AND user_id = ${userId}
    `;
  }
);

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
