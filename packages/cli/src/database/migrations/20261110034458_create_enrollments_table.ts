import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("enrollments", (table) => {
      table.id();
      table.foreignId("student_id").constrained("students").cascadeOnDelete();
      table.foreignId("course_id").constrained("courses").cascadeOnDelete();
      table.timestamp("enrolled_at");
      table.string("status", 32).default("enrolled"); // enrolled | completed | dropped | failed
      table.integer("progress").default(0);
      table.timestamp("completed_at").nullable();
      table.timestamps();
      table.index("status");
      table.unique(["student_id", "course_id"]);
    });
  },

  async down(schema) {
    await schema.drop("enrollments");
  },
});
