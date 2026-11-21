import {z} from "zod";
export const invitationSchema=z.object({name:z.string().trim().min(2).max(120),email:z.string().trim().email().max(254),company:z.string().trim().max(160).optional().or(z.literal("")),website:z.string().url().max(2048).optional().or(z.literal(""))});
