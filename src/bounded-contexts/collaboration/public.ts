import { ManageComments } from "./application/manage-comments";
import { CommentRepository } from "./infrastructure/http-repository";
export const comments = new ManageComments(new CommentRepository());
