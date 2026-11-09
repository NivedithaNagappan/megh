import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("suppliers", (table) => {
      table.id();
      table.string("name");
      table.string("contact_name").nullable();
      table.string("email").nullable();
      table.string("phone", 32).nullable();
      table.string("address_line1").nullable();
      table.string("address_line2").nullable();
      table.string("city", 100).nullable();
      table.string("state", 100).nullable();
      table.string("postal_code", 20).nullable();
      table.string("country", 100).nullable();
      table.string("tax_number", 64).nullable();
      table.boolean("is_active").default(true);
      table.timestamps();
    });
  },

  async down(schema) {
    await schema.drop("suppliers");
  },
});
