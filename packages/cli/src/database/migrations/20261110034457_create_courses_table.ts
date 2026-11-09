import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("courses", (table) => {
      table.id();
      table.foreignId("teacher_id").constrained("teachers").nullOnDelete();
      table.string("code", 32).unique();
      table.string("title");
      table.text("description").nullable();
      table.integer("credits").default(3);
      table.string("level", 32).nullable();
      table.integer("capacity").nullable();
      table.decimal("price", 12, 2).nullable();
      table.string("status", 32).default("draft"); // draft | published | archived
      table.timestamp("starts_at").nullable();
      table.timestamp("ends_at").nullable();
      table.timestamps();
      table.index("status");
    });
  },

  async down(schema) {
    await schema.drop("courses");
  },
});
