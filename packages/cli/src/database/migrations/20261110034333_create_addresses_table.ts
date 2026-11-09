import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("addresses", (table) => {
      table.id();
      table.string("addressable_type", 64);
      table.integer("addressable_id");
      table.string("label", 64).nullable();
      table.string("address_line1");
      table.string("address_line2").nullable();
      table.string("city", 100);
      table.string("state", 100).nullable();
      table.string("postal_code", 20).nullable();
      table.string("country", 100);
      table.decimal("latitude", 10, 7).nullable();
      table.decimal("longitude", 10, 7).nullable();
      table.boolean("is_default").default(false);
      table.timestamps();
      table.index("addressable_type");
      table.index("addressable_id");
    });
  },

  async down(schema) {
    await schema.drop("addresses");
  },
});
