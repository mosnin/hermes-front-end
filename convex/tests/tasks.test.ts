import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";

const modules = import.meta.glob("../**/*.*s");

describe("tasks CRUD + role enforcement (requireRole)", () => {
  test("the owner can create, list, update, and remove a task", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "user_owner", org_id: "org_a" });

    const spaceId = await owner.mutation(api.spaces.create, { name: "Work" });

    // create
    const taskId = await owner.mutation(api.tasks.create, {
      spaceId,
      title: "Ship the thing",
      priority: "high",
    });
    expect(taskId).toBeDefined();

    // list
    let tasks = await owner.query(api.tasks.list, { spaceId });
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe("Ship the thing");
    expect(tasks[0].status).toBe("todo");
    expect(tasks[0].priority).toBe("high");

    // update
    await owner.mutation(api.tasks.update, {
      spaceId,
      taskId,
      status: "in_progress",
      title: "Ship the thing (v2)",
    });
    tasks = await owner.query(api.tasks.list, { spaceId });
    expect(tasks[0].status).toBe("in_progress");
    expect(tasks[0].title).toBe("Ship the thing (v2)");

    // remove
    await owner.mutation(api.tasks.remove, { spaceId, taskId });
    tasks = await owner.query(api.tasks.list, { spaceId });
    expect(tasks).toHaveLength(0);
  });

  test("an operator member can create tasks", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "user_owner", org_id: "org_a" });
    const operator = t.withIdentity({ subject: "user_op", org_id: "org_a" });

    const spaceId = await owner.mutation(api.spaces.create, { name: "Work" });
    await owner.mutation(api.spaces.addMember, {
      spaceId,
      userId: "user_op",
      role: "operator",
    });

    const taskId = await operator.mutation(api.tasks.create, {
      spaceId,
      title: "Operator task",
    });
    expect(taskId).toBeDefined();

    const tasks = await operator.query(api.tasks.list, { spaceId });
    expect(tasks).toHaveLength(1);
  });

  test("a viewer is rejected from creating tasks", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "user_owner", org_id: "org_a" });
    const viewer = t.withIdentity({ subject: "user_viewer", org_id: "org_a" });

    const spaceId = await owner.mutation(api.spaces.create, { name: "Work" });
    await owner.mutation(api.spaces.addMember, {
      spaceId,
      userId: "user_viewer",
      role: "viewer",
    });

    // A viewer can read the Space + list tasks, but not mutate.
    const space = await viewer.query(api.spaces.get, { spaceId });
    expect(space.role).toBe("viewer");

    await expect(
      viewer.mutation(api.tasks.create, { spaceId, title: "Nope" }),
    ).rejects.toThrow(/requires operator/);
  });

  test("a non-member cannot list tasks in the Space", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "user_owner", org_id: "org_a" });
    const outsider = t.withIdentity({ subject: "user_x", org_id: "org_b" });

    const spaceId = await owner.mutation(api.spaces.create, { name: "Work" });
    await owner.mutation(api.tasks.create, { spaceId, title: "Secret" });

    await expect(
      outsider.query(api.tasks.list, { spaceId }),
    ).rejects.toThrow(/Space not found/);
  });
});
