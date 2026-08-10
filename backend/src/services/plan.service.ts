import { PlanRepository } from "../repositories/plan.repository.js";
import { CreatePlanInput, UpdatePlanInput } from "../types/billing.types.js";
import { badRequest, conflict, notFound } from "../utils/AppError.js";

const planRepo = new PlanRepository();

export class PlanService {
  async list(includeInactive: boolean) {
    return planRepo.findMany(includeInactive);
  }

  async getById(id: string) {
    const plan = await planRepo.findById(id);

    if (!plan) {
      throw notFound("Plan not found");
    }

    return plan;
  }

  async create(input: CreatePlanInput) {
    const existing = await planRepo.findByName(input.name);

    if (existing) {
      throw conflict(`A plan named "${input.name}" already exists`);
    }

    return planRepo.create({
      ...input,
      description: input.description || null,
      features: input.features ?? [],
    });
  }

  async update(id: string, input: UpdatePlanInput) {
    const plan = await planRepo.findById(id);

    if (!plan) {
      throw notFound("Plan not found");
    }

    if (input.name && input.name !== plan.name) {
      const nameTaken = await planRepo.findByName(input.name);

      if (nameTaken) {
        throw conflict(`A plan named "${input.name}" already exists`);
      }
    }

    return planRepo.update(id, {
      ...input,
      description:
        input.description === undefined ? undefined : input.description || null,
    });
  }

  async remove(id: string) {
    const plan = await planRepo.findById(id);

    if (!plan) {
      throw notFound("Plan not found");
    }

    if (plan._count.subscriptions > 0) {
      throw badRequest(
        `This plan has ${plan._count.subscriptions} subscription(s). Deactivate it instead of deleting it.`
      );
    }

    await planRepo.delete(id);
  }
}
