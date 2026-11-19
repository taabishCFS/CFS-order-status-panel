import db from "../db.server";
import { checkHealth } from "../health.server.js";

export const loader = () => checkHealth(db);
