import { ManageResources } from "@/kernel/application/manage-resources";
import type { Comment } from "../domain/comment";
/** Coordinates comments through a replaceable repository port. */
export class ManageComments extends ManageResources<Comment> {}
