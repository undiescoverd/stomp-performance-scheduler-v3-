import { Service } from "encore.dev/service";
import { Gateway } from "encore.dev/api";
import { auth } from "./encore_auth";

export default new Service("auth");

// Configure Encore Gateway with authentication handler
export const gateway = new Gateway({
  authHandler: auth,
});