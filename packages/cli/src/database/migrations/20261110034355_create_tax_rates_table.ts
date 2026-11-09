import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("tax_rates", (table) => {
      table.id();
      table.string("name");
      table.decimal("rate", 5, 2);
      table.boolean("is_inclusive").default(false);
      table.boolean("is_active").default(true);
      table.timestamps();
    });
  },

  async down(schema) {
    await schema.drop("tax_rates");
  },
});
