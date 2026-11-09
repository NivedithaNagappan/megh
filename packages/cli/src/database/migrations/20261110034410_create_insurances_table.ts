import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("insurances", (table) => {
      table.id();
      table.foreignId("patient_id").constrained("patients").cascadeOnDelete();
      table.string("provider");
      table.string("policy_number", 64);
      table.string("group_number", 64).nullable();
      table.decimal("coverage_percent", 5, 2).nullable();
      table.date("valid_from").nullable();
      table.date("valid_until").nullable();
      table.boolean("is_active").default(true);
      table.timestamps();
    });
  },

  async down(schema) {
    await schema.drop("insurances");
  },
});
