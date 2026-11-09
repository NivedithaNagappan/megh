import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("agents", (table) => {
      table.id();
      table.foreignId("user_id").constrained("users").nullOnDelete();
      table.string("first_name", 100);
      table.string("last_name", 100);
      table.string("email").unique();
      table.string("phone", 32).nullable();
      table.string("license_number", 64).nullable();
      table.string("agency").nullable();
      table.decimal("commission_rate", 5, 2).nullable();
      table.string("avatar", 2048).nullable();
      table.boolean("is_active").default(true);
      table.timestamps();
    });
  },

  async down(schema) {
    await schema.drop("agents");
  },
});
