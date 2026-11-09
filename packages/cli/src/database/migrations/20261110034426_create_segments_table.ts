import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("segments", (table) => {
      table.id();
      table.string("name");
      table.text("description").nullable();
      table.json("rules").nullable();
      table.boolean("is_dynamic").default(false);
      table.timestamps();
    });
  },

  async down(schema) {
    await schema.drop("segments");
  },
});
