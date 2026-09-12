import { HttpResourceRepository } from "@/shared/infrastructure/http-resource-repository";
import type { Comment } from "../domain/comment";
export class CommentRepository extends HttpResourceRepository<Comment> {
  constructor() {
    super("comments");
  }
}
