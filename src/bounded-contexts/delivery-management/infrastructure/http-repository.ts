import { HttpResourceRepository } from "@/shared/infrastructure/http-resource-repository";
import type { DeliverablePackage } from "../domain/deliverable-package";
export class DeliverablePackageRepository extends HttpResourceRepository<DeliverablePackage> {
  constructor() {
    super("deliverable-packages");
  }
}
