import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("property_amenities", (table) => {
      table.foreignId("property_id").constrained("properties").cascadeOnDelete();
      table.foreignId("amenity_id").constrained("amenities").cascadeOnDelete();
      table.primary(["property_id", "amenity_id"]);
    });
  },

  async down(schema) {
    await schema.drop("property_amenities");
  },
});
