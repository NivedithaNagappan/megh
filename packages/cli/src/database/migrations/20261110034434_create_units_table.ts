import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("units", (table) => {
      table.id();
      table.foreignId("property_id").constrained("properties").cascadeOnDelete();
      table.string("unit_number", 32);
      table.integer("floor").nullable();
      table.integer("bedrooms").default(0);
      table.decimal("bathrooms", 3, 1).default(0);
      table.decimal("area", 10, 2).nullable();
      table.decimal("rent", 12, 2).nullable();
      table.string("status", 32).default("vacant"); // vacant | occupied | reserved | maintenance
      table.timestamps();
      table.index("status");
      table.unique(["property_id", "unit_number"]);
    });
  },

  async down(schema) {
    await schema.drop("units");
  },
});
