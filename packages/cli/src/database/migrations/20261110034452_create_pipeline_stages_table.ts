import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("pipeline_stages", (table) => {
      table.id();
      table.foreignId("pipeline_id").constrained("pipelines").cascadeOnDelete();
      table.string("name");
      table.integer("probability").default(0);
      table.integer("sort_order").default(0);
      table.boolean("is_won").default(false);
      table.boolean("is_lost").default(false);
      table.timestamps();
    });
  },

  async down(schema) {
    await schema.drop("pipeline_stages");
  },
});
