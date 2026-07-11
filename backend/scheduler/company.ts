import { api } from "encore.dev/api";
import { scheduleDB } from "./db";
import { CAST_MEMBERS, ROLES, FEMALE_ONLY_ROLES, CastMember, Role } from "./types";

// Female-only roles (Bin/Cornish) imply a female performer, so a member's
// gender can be derived from eligibility when not explicitly provided.
function deriveGender(eligibleRoles: Role[]): "male" | "female" {
  return eligibleRoles.some(r => FEMALE_ONLY_ROLES.includes(r)) ? "female" : "male";
}

export interface CompanyMember {
  id: string;
  name: string;
  eligibleRoles: Role[];
  gender: "male" | "female";
  status: "active" | "archived";
  dateAdded: Date;
  dateArchived?: Date;
  order: number;
}

export interface GetCompanyResponse {
  currentCompany: CompanyMember[];
  archive: CompanyMember[];
  roles: Role[];
}

export interface AddMemberRequest {
  name: string;
  eligibleRoles: Role[];
  gender?: "male" | "female";
  status?: "active" | "archived";
}

export interface AddMemberResponse {
  member: CompanyMember;
}

export interface UpdateMemberRequest {
  id: string;
  name?: string;
  eligibleRoles?: Role[];
  gender?: "male" | "female";
  status?: "active" | "archived";
  order?: number;
}

export interface UpdateMemberResponse {
  member: CompanyMember;
}

export interface DeleteMemberRequest {
  id: string;
}

export interface ReorderMembersRequest {
  memberIds: string[];
}

// Raw column shape as returned by the "scheduler" DB. eligible_roles is a JSONB
// column but Encore returns JSONB as a string (same as schedules.shows_data),
// so it must be JSON.parsed. date_archived is nullable.
interface CompanyRow {
  id: string;
  name: string;
  eligible_roles: string;
  gender: string;
  status: string;
  date_added: string | Date;
  date_archived: string | Date | null;
  order: number;
}

function mapRow(row: CompanyRow): CompanyMember {
  return {
    id: row.id,
    name: row.name,
    eligibleRoles: JSON.parse(row.eligible_roles) as Role[],
    gender: row.gender as "male" | "female",
    status: row.status as "active" | "archived",
    dateAdded: new Date(row.date_added),
    dateArchived: row.date_archived ? new Date(row.date_archived) : undefined,
    order: row.order,
  };
}

// Seed the 12 default cast members exactly once. Gated on a durable marker
// row (company_seed_marker), not a COUNT(*) check — a count-based check would
// re-seed the defaults whenever company_members is empty, resurrecting a
// roster a user intentionally deleted down to zero. Deterministic ids
// (member_seed_0..11) + ON CONFLICT DO NOTHING keep concurrent cold starts
// race-safe and let a partial seed (crash mid-loop, marker never written)
// heal itself on the next call instead of getting stuck half-seeded.
async function ensureSeeded(): Promise<void> {
  const marker = await scheduleDB.queryRow<{ id: number }>`
    SELECT id FROM company_seed_marker WHERE id = 1
  `;
  if (marker) {
    return;
  }

  for (let index = 0; index < CAST_MEMBERS.length; index++) {
    const member = CAST_MEMBERS[index];
    const gender = member.gender ?? deriveGender(member.eligibleRoles);
    await scheduleDB.exec`
      INSERT INTO company_members (id, name, eligible_roles, gender, status, "order")
      VALUES (
        ${`member_seed_${index}`},
        ${member.name},
        ${JSON.stringify(member.eligibleRoles)},
        ${gender},
        ${"active"},
        ${index}
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }

  // Recorded only after every insert above succeeds — see comment above.
  await scheduleDB.exec`
    INSERT INTO company_seed_marker (id) VALUES (1)
    ON CONFLICT (id) DO NOTHING
  `;
}

// Retrieves the current company and archive.
export const getCompany = api<void, GetCompanyResponse>(
  { expose: true, method: "GET", path: "/company" },
  async () => {
    await ensureSeeded();

    const rows = await scheduleDB.queryAll<CompanyRow>`
      SELECT id, name, eligible_roles, gender, status, date_added, date_archived, "order"
      FROM company_members
      ORDER BY "order" ASC
    `;
    const members = rows.map(mapRow);

    const currentCompany = members.filter(m => m.status === "active");

    const archive = members
      .filter(m => m.status === "archived")
      .sort((a, b) => (b.dateArchived?.getTime() || 0) - (a.dateArchived?.getTime() || 0));

    return {
      currentCompany,
      archive,
      roles: ROLES
    };
  }
);

// Adds a new cast member to the company.
export const addMember = api<AddMemberRequest, AddMemberResponse>(
  { expose: true, method: "POST", path: "/company/members", auth: true },
  async (req) => {
    await ensureSeeded();

    const id = `member_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();
    const status = req.status || "active";
    const gender = req.gender ?? deriveGender(req.eligibleRoles);

    // Next order at the end of the active list (archived members share order 0).
    const orderRow = await scheduleDB.queryRow<{ next: number }>`
      SELECT COALESCE(MAX("order"), -1) + 1 AS next
      FROM company_members WHERE status = 'active'
    `;
    const order = status === "active" ? (orderRow?.next ?? 0) : 0;
    const dateArchived = status === "archived" ? now : null;

    const member: CompanyMember = {
      id,
      name: req.name.toUpperCase(),
      eligibleRoles: req.eligibleRoles,
      gender,
      status,
      dateAdded: now,
      dateArchived: dateArchived ?? undefined,
      order
    };

    await scheduleDB.exec`
      INSERT INTO company_members (id, name, eligible_roles, gender, status, date_added, date_archived, "order")
      VALUES (
        ${member.id},
        ${member.name},
        ${JSON.stringify(member.eligibleRoles)},
        ${member.gender},
        ${member.status},
        ${now},
        ${dateArchived},
        ${member.order}
      )
    `;

    return { member };
  }
);

// Updates an existing cast member.
export const updateMember = api<UpdateMemberRequest, UpdateMemberResponse>(
  { expose: true, method: "PUT", path: "/company/members/:id", auth: true },
  async (req) => {
    await ensureSeeded();

    const existing = await scheduleDB.queryRow<CompanyRow>`
      SELECT id, name, eligible_roles, gender, status, date_added, date_archived, "order"
      FROM company_members WHERE id = ${req.id}
    `;
    if (!existing) {
      throw new Error("Member not found");
    }

    const member = mapRow(existing);
    const now = new Date();

    // Coalesce provided fields.
    if (req.name !== undefined) member.name = req.name.toUpperCase();
    if (req.eligibleRoles !== undefined) member.eligibleRoles = req.eligibleRoles;
    if (req.gender !== undefined) member.gender = req.gender;
    if (req.order !== undefined) member.order = req.order;

    // Handle status changes.
    if (req.status !== undefined && req.status !== member.status) {
      member.status = req.status;

      if (req.status === "archived") {
        member.dateArchived = now;
        member.order = 0; // Reset order for archived members
      } else if (req.status === "active") {
        // Moving back to active — clear archive date and append to active list.
        member.dateArchived = undefined;

        const orderRow = await scheduleDB.queryRow<{ next: number }>`
          SELECT COALESCE(MAX("order"), -1) + 1 AS next
          FROM company_members WHERE status = 'active' AND id != ${req.id}
        `;
        member.order = orderRow?.next ?? 0;
      }
    }

    await scheduleDB.exec`
      UPDATE company_members SET
        name = ${member.name},
        eligible_roles = ${JSON.stringify(member.eligibleRoles)},
        gender = ${member.gender},
        status = ${member.status},
        date_archived = ${member.dateArchived ?? null},
        "order" = ${member.order}
      WHERE id = ${req.id}
    `;

    return { member };
  }
);

// Deletes a cast member permanently.
export const deleteMember = api<DeleteMemberRequest, void>(
  { expose: true, method: "DELETE", path: "/company/members/:id", auth: true },
  async (req) => {
    await ensureSeeded();

    const existing = await scheduleDB.queryRow<{ id: string }>`
      SELECT id FROM company_members WHERE id = ${req.id}
    `;
    if (!existing) {
      throw new Error("Member not found");
    }

    await scheduleDB.exec`DELETE FROM company_members WHERE id = ${req.id}`;
  }
);

// Reorders the current company members.
export const reorderMembers = api<ReorderMembersRequest, void>(
  { expose: true, method: "PUT", path: "/company/reorder", auth: true },
  async (req) => {
    await ensureSeeded();

    // Update order based on the provided array (active members only).
    for (let index = 0; index < req.memberIds.length; index++) {
      await scheduleDB.exec`
        UPDATE company_members SET "order" = ${index}
        WHERE id = ${req.memberIds[index]} AND status = 'active'
      `;
    }
  }
);
