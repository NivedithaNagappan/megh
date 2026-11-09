import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("properties", (table) => {
      table.id();
      table.foreignId("agent_id").constrained("agents").nullOnDelete();
      table.string("title");
      table.string("slug").unique();
      table.text("description").nullable();
      table.string("type", 32); // apartment | house | condo | townhouse | land | commercial | office
      table.string("status", 32).default("available"); // available | under_contract | sold | rented | off_market
      table.string("address_line1");
      table.string("address_line2").nullable();
      table.string("city", 100);
      table.string("state", 100).nullable();
      table.string("postal_code", 20).nullable();
      table.string("country", 100);
      table.decimal("latitude", 10, 7).nullable();
      table.decimal("longitude", 10, 7).nullable();
      table.integer("bedrooms").default(0);
      table.decimal("bathrooms", 3, 1).default(0);
      table.decimal("area", 10, 2).nullable();
      table.string("area_unit", 8).default("sqft");
      table.decimal("lot_size", 12, 2).nullable();
      table.integer("year_built").nullable();
      table.decimal("price", 12, 2).nullable();
      table.string("currency", 3).default("USD");
      table.boolean("is_featured").default(false);
      table.timestamps();
      table.softDeletes();
      table.index("type");
      table.index("status");
    });
  },

  async down(schema) {
    await schema.drop("properties");
  },
});
