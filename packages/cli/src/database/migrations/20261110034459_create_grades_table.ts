import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("grades", (table) => {
      table.id();
      table.foreignId("enrollment_id").constrained("enrollments").cascadeOnDelete();
      table.string("assessment", 128);
      table.decimal("score", 6, 2);
      table.decimal("max_score", 6, 2).default(100);
      table.string("letter", 4).nullable();
      table.decimal("weight", 5, 2).nullable();
      table.timestamp("graded_at").nullable();
      table.text("remarks").nullable();
      table.timestamps();
    });
  },

  async down(schema) {
    await schema.drop("grades");
  },
});
