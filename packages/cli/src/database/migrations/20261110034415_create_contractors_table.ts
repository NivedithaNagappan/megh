import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("contractors", (table) => {
      table.id();
      table.string("name");
      table.string("company").nullable();
      table.string("trade", 64).nullable();
      table.string("email").nullable();
      table.string("phone", 32).nullable();
      table.string("license_number", 64).nullable();
      table.string("address_line1").nullable();
      table.string("address_line2").nullable();
      table.string("city", 100).nullable();
      table.string("state", 100).nullable();
      table.string("postal_code", 20).nullable();
      table.string("country", 100).nullable();
      table.integer("rating").default(0);
      table.boolean("is_active").default(true);
      table.timestamps();
    });
  },

  async down(schema) {
    await schema.drop("contractors");
  },
});
