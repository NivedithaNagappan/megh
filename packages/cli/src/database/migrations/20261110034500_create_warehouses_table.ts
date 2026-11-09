import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("warehouses", (table) => {
      table.id();
      table.string("name");
      table.string("code", 32).unique();
      table.string("address_line1");
      table.string("address_line2").nullable();
      table.string("city", 100);
      table.string("state", 100).nullable();
      table.string("postal_code", 20).nullable();
      table.string("country", 100);
      table.decimal("latitude", 10, 7).nullable();
      table.decimal("longitude", 10, 7).nullable();
      table.string("phone", 32).nullable();
      table.integer("capacity").nullable();
      table.boolean("is_active").default(true);
      table.timestamps();
    });
  },

  async down(schema) {
    await schema.drop("warehouses");
  },
});
