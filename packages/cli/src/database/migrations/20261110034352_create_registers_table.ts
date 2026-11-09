import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("registers", (table) => {
      table.id();
      table.foreignId("outlet_id").constrained("outlets").cascadeOnDelete();
      table.string("name");
      table.boolean("is_active").default(true);
      table.timestamps();
    });
  },

  async down(schema) {
    await schema.drop("registers");
  },
});
