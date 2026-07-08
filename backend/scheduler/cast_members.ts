import { api } from "encore.dev/api";
import { CAST_MEMBERS, ROLES, CastMember, Role } from "./types";

export interface GetCastMembersResponse {
  castMembers: CastMember[];
  roles: Role[];
}

// Retrieves all cast members and their role eligibility from the company management system.
export const getCastMembers = api<void, GetCastMembersResponse>(
  { expose: true, method: "GET", path: "/cast-members" },
  async () => {
    // Import the company module dynamically to avoid circular dependencies
    try {
      const { getCompany } = await import("./company");
      
      // Get active company members
      const companyData = await getCompany();
      
      // Convert company members to CastMember format (carry gender through)
      const castMembers: CastMember[] = companyData.currentCompany.map(member => ({
        name: member.name,
        eligibleRoles: member.eligibleRoles,
        gender: member.gender
      }));
      
      return {
        castMembers: castMembers.length > 0 ? castMembers : CAST_MEMBERS,
        roles: ROLES
      };
    } catch (error) {
      // Fallback to default cast members if company system fails
      return {
        castMembers: CAST_MEMBERS,
        roles: ROLES
      };
    }
  }
);
