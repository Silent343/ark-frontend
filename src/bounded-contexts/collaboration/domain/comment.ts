import {
  required,
  choice,

  type Resource,
  type ResourceRules,
} from "@/kernel/domain/resource";
/** Comment belongs to its project and exposes stable references across contexts. */
export interface Comment extends Resource {
  content: string;
  target_type: string;
  target_id: string;
  visibility: string;
}
export const CommentRules: ResourceRules = {
  fields: ["content", "target_type", "target_id", "visibility"],
  validate(v) {
    required(v.content, "content", 2000);
    choice(
      v.target_type,
      ["project", "task", "document", "element"],
      "target_type",
    );
    choice(v.visibility, ["team", "client"], "visibility");
  },
};
