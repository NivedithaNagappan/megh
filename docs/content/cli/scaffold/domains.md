---
title: Domains
description: Scaffold the tables of a business domain, such as e-commerce, POS or medical, with scaffold:domain.
---

# Domains

```sh
npx megh scaffold:domain ecommerce            # checklist of the domain's templates
npx megh sc:domain ecommerce -y --resource    # every template, as REST resources
npx megh sc:domain pos --only product,sale,sale_item --factory
npx megh sc:domain medical --migrations-only
npx megh sc:domain                            # pick a domain
```

`scaffold:domain` writes a migration for each template of a domain, in the
order their foreign keys need, and then a model for each (join tables have
none). Templates a foreign key points to from another domain are included,
such as `common/user` for `ecommerce/customer`.

Domains share tables: `ecommerce` and `pos` both have `products` and
`customers`, and `hr` and `medical` both have `departments`. Scaffolding a
second domain reuses the tables and models already there.

| Option | Description |
|---|---|
| `--only <list>` | Only these templates, e.g. `product,order,order_item` |
| `--all` | Every template, without the checklist |
| `--resource` | Generate REST resources (DTOs, service, controller), not just models |
| `--migrations-only` | Only write the migrations |
| `--factory` | Also write a factory for each model |
| `--no-deps` | Don't create the tables foreign keys point to |
| `-f`, `--force` | Regenerate the models (and resources) that already exist |
| `-y`, `--yes` | Don't prompt: every template (or `--only`), with their dependencies |

Scaffold a single template with
[`make:model --template`](/cli/scaffold/templates#from-a-template), and add your
own domains in [`.megh/templates/`](/cli/scaffold/templates#your-own-templates).

## Built-in Templates

Every table also has an `id`, `created_at` and `updated_at`, except join
tables, which have neither. Run `npx megh templates <domain>` for the same list in the
terminal.

### Common `common`

Users, roles, categories and other tables most apps share.

| Template | Table | Columns |
|---|---|---|
| `user` | `users` (soft deletes) | name, email, password, email_verified_at, remember_token, is_active, last_login_at |
| `role` | `roles` | name, slug, description |
| `permission` | `permissions` | name, group, description |
| `user_role` | `user_roles` (join table) | user_id, role_id |
| `role_permission` | `role_permissions` (join table) | role_id, permission_id |
| `category` | `categories` | parent_id, name, slug, description, image, sort_order, is_active |
| `tag` | `tags` | name, slug |
| `address` | `addresses` | addressable_type, addressable_id, label, address_line1, address_line2, city, state, postal_code, country, latitude, longitude, is_default |
| `attachment` | `attachments` | attachable_type, attachable_id, name, path, disk, mime_type, size |
| `api_key` | `api_keys` | user_id, name, prefix, key_hash, last_used_at, expires_at, revoked_at |
| `setting` | `settings` | name, value, group |

### E-commerce `ecommerce`

An online store: catalog, carts, orders and payments.

| Template | Table | Columns |
|---|---|---|
| `brand` | `brands` | name, slug, logo, description, website, is_active |
| `product` | `products` (soft deletes) | category_id, brand_id, name, slug, sku, description, price, compare_at_price, cost, stock, weight, status, is_featured |
| `product_variant` | `product_variants` | product_id, sku, name, price, stock, options, image |
| `product_tag` | `product_tags` (join table) | product_id, tag_id |
| `customer` | `customers` | user_id, first_name, last_name, email, phone, accepts_marketing |
| `cart` | `carts` | customer_id, session_id, currency, status |
| `cart_item` | `cart_items` | cart_id, product_id, product_variant_id, quantity, price |
| `coupon` | `coupons` | code, description, discount_type, value, min_order_amount, max_uses, used_count, starts_at, ends_at, is_active |
| `order` | `orders` | customer_id, coupon_id, number, status, subtotal, discount, tax, shipping_total, total, currency, shipping_address, billing_address, placed_at, notes |
| `order_item` | `order_items` | order_id, product_id, product_variant_id, name, sku, quantity, price, discount, total |
| `payment` | `payments` | order_id, method, provider, transaction_id, amount, currency, status, paid_at |
| `shipment` | `shipments` | order_id, carrier, tracking_number, status, shipped_at, delivered_at |
| `review` | `reviews` | product_id, customer_id, rating, title, comment, is_approved |
| `wishlist` | `wishlists` | customer_id, product_id |

### Point of sale `pos`

Shops and tills: outlets, shifts, sales, purchases and stock.

| Template | Table | Columns |
|---|---|---|
| `outlet` | `outlets` | name, code, phone, email, address_line1, address_line2, city, state, postal_code, country, is_active |
| `register` | `registers` | outlet_id, name, is_active |
| `shift` | `shifts` | register_id, user_id, opened_at, closed_at, opening_cash, closing_cash, expected_cash, status, notes |
| `customer` | `customers` | name, email, phone, loyalty_points, notes |
| `supplier` | `suppliers` | name, contact_name, email, phone, address_line1, address_line2, city, state, postal_code, country, tax_number, is_active |
| `tax_rate` | `tax_rates` | name, rate, is_inclusive, is_active |
| `product` | `products` | category_id, name, sku, barcode, price, cost, stock, reorder_level, tax_rate_id, is_active |
| `sale` | `sales` | outlet_id, register_id, shift_id, customer_id, user_id, number, subtotal, discount, tax, total, paid_amount, change_amount, status, sold_at |
| `sale_item` | `sale_items` | sale_id, product_id, name, quantity, price, discount, tax, total |
| `sale_payment` | `sale_payments` | sale_id, method, amount, reference |
| `purchase` | `purchases` | supplier_id, outlet_id, number, status, subtotal, tax, total, ordered_at, received_at, notes |
| `purchase_item` | `purchase_items` | purchase_id, product_id, quantity, unit_cost, total |
| `stock_movement` | `stock_movements` | product_id, outlet_id, user_id, type, quantity, reference, notes |

### Medical `medical`

Clinics and hospitals: patients, doctors, appointments and records.

| Template | Table | Columns |
|---|---|---|
| `department` | `departments` | name, code, description, phone, is_active |
| `doctor` | `doctors` | user_id, department_id, first_name, last_name, email, phone, specialization, license_number, consultation_fee, is_active |
| `patient` | `patients` (soft deletes) | mrn, first_name, last_name, gender, date_of_birth, phone, email, address_line1, address_line2, city, state, postal_code, country, blood_group, allergies, emergency_contact_name, emergency_contact_phone |
| `appointment` | `appointments` | patient_id, doctor_id, department_id, scheduled_at, duration_minutes, status, reason, notes |
| `medical_record` | `medical_records` | patient_id, doctor_id, appointment_id, visit_date, chief_complaint, diagnosis, treatment, vitals, notes |
| `medication` | `medications` | name, generic_name, form, strength, manufacturer, price, stock, is_active |
| `prescription` | `prescriptions` | patient_id, doctor_id, medical_record_id, medication_id, dosage, frequency, duration, quantity, instructions, prescribed_at |
| `lab_test` | `lab_tests` | patient_id, doctor_id, name, code, status, result, normal_range, unit, ordered_at, completed_at |
| `insurance` | `insurances` | patient_id, provider, policy_number, group_number, coverage_percent, valid_from, valid_until, is_active |
| `invoice` | `invoices` | patient_id, appointment_id, insurance_id, number, subtotal, discount, tax, total, paid_amount, status, issued_at, due_date |

### Construction `construction`

Building projects: sites, contractors, work orders, materials and budgets.

| Template | Table | Columns |
|---|---|---|
| `client` | `clients` | name, company, email, phone, address_line1, address_line2, city, state, postal_code, country |
| `project` | `projects` (soft deletes) | client_id, manager_id, name, code, description, status, budget, start_date, end_date, address_line1, address_line2, city, state, postal_code, country |
| `site` | `sites` | project_id, supervisor_id, name, address_line1, address_line2, city, state, postal_code, country, latitude, longitude, is_active |
| `contractor` | `contractors` | name, company, trade, email, phone, license_number, address_line1, address_line2, city, state, postal_code, country, rating, is_active |
| `work_order` | `work_orders` | project_id, site_id, contractor_id, assigned_to_id, title, description, priority, status, due_date, completed_at, estimated_cost, actual_cost |
| `material` | `materials` | name, sku, unit, unit_cost, quantity_on_hand, reorder_level, supplier |
| `equipment` | `equipment` | site_id, name, code, category, serial_number, status, purchase_date, purchase_cost |
| `timesheet` | `timesheets` | user_id, project_id, work_order_id, date, hours, overtime_hours, status, notes |
| `inspection` | `inspections` | project_id, site_id, inspector_name, type, scheduled_at, inspected_at, result, notes |
| `change_order` | `change_orders` | project_id, requested_by_id, number, title, description, amount, days_impact, status, approved_at |
| `budget_item` | `budget_items` | project_id, category, description, budgeted_amount, actual_amount, notes |

### Marketing `marketing`

Campaigns, leads, contacts, segments and email.

| Template | Table | Columns |
|---|---|---|
| `campaign` | `campaigns` | owner_id, name, slug, type, status, budget, spent, starts_at, ends_at, description |
| `contact` | `contacts` | first_name, last_name, email, phone, company, job_title, source, country, status |
| `lead` | `leads` | contact_id, campaign_id, owner_id, name, email, phone, company, source, status, score, notes |
| `segment` | `segments` | name, description, rules, is_dynamic |
| `contact_segment` | `contact_segments` (join table) | contact_id, segment_id |
| `email_template` | `email_templates` | name, subject, body, from_name, from_email, is_active |
| `subscriber` | `subscribers` | email, name, status, source, subscribed_at, unsubscribed_at, ip_address |
| `landing_page` | `landing_pages` | campaign_id, title, slug, content, meta_title, meta_description, status, published_at, views, conversions |
| `utm_link` | `utm_links` | campaign_id, url, utm_source, utm_medium, utm_campaign, utm_term, utm_content, short_code, clicks |

### Real estate `real-estate`

Properties, listings, agents, tenants, leases and rent.

| Template | Table | Columns |
|---|---|---|
| `agent` | `agents` | user_id, first_name, last_name, email, phone, license_number, agency, commission_rate, avatar, is_active |
| `property` | `properties` (soft deletes) | agent_id, title, slug, description, type, status, address_line1, address_line2, city, state, postal_code, country, latitude, longitude, bedrooms, bathrooms, area, area_unit, lot_size, year_built, price, currency, is_featured |
| `unit` | `units` | property_id, unit_number, floor, bedrooms, bathrooms, area, rent, status |
| `amenity` | `amenities` | name, slug, icon, category |
| `property_amenity` | `property_amenities` (join table) | property_id, amenity_id |
| `listing` | `listings` | property_id, agent_id, type, price, currency, status, listed_at, expires_at, description, views |
| `tenant` | `tenants` | user_id, first_name, last_name, email, phone, date_of_birth, national_id, employer, monthly_income, emergency_contact_name, emergency_contact_phone |
| `lease` | `leases` | unit_id, tenant_id, start_date, end_date, rent_amount, deposit_amount, billing_day, status, terms, signed_at |
| `rent_payment` | `rent_payments` | lease_id, amount, due_date, paid_at, method, reference, status, late_fee |
| `inquiry` | `inquiries` | property_id, listing_id, agent_id, name, email, phone, message, status |
| `viewing` | `viewings` | property_id, inquiry_id, agent_id, scheduled_at, status, feedback |
| `maintenance_request` | `maintenance_requests` | unit_id, tenant_id, title, description, priority, status, reported_at, resolved_at, cost |

### HR `hr`

Employees, departments, attendance, leave and payroll.

| Template | Table | Columns |
|---|---|---|
| `department` | `departments` | name, code, description, is_active |
| `position` | `positions` | department_id, title, description, min_salary, max_salary |
| `employee` | `employees` (soft deletes) | user_id, department_id, position_id, employee_number, first_name, last_name, email, phone, gender, date_of_birth, hire_date, employment_type, salary, status, address_line1, address_line2, city, state, postal_code, country |
| `attendance` | `attendances` | employee_id, date, check_in, check_out, status, hours, notes |
| `leave_type` | `leave_types` | name, code, days_per_year, is_paid |
| `leave_request` | `leave_requests` | employee_id, leave_type_id, approved_by_id, start_date, end_date, days, reason, status, approved_at |
| `payroll` | `payrolls` | employee_id, period_start, period_end, basic_salary, allowances, deductions, tax, net_pay, status, paid_at |

### CRM `crm`

Accounts, contacts, deal pipelines and activities.

| Template | Table | Columns |
|---|---|---|
| `account` | `accounts` | owner_id, name, industry, website, phone, email, address_line1, address_line2, city, state, postal_code, country, annual_revenue, employee_count, status |
| `contact` | `contacts` | account_id, owner_id, first_name, last_name, email, phone, job_title, notes |
| `pipeline` | `pipelines` | name, is_default, sort_order |
| `pipeline_stage` | `pipeline_stages` | pipeline_id, name, probability, sort_order, is_won, is_lost |
| `deal` | `deals` | account_id, contact_id, pipeline_id, pipeline_stage_id, owner_id, title, amount, currency, expected_close_date, status, closed_at, lost_reason |
| `activity` | `activities` | user_id, account_id, contact_id, deal_id, type, subject, description, due_at, completed_at |

### Education `education`

Schools and courses: students, teachers, enrollments and grades.

| Template | Table | Columns |
|---|---|---|
| `teacher` | `teachers` | user_id, staff_number, first_name, last_name, email, phone, specialization, hire_date, is_active |
| `student` | `students` | user_id, student_number, first_name, last_name, email, phone, gender, date_of_birth, admission_date, status, address_line1, address_line2, city, state, postal_code, country |
| `course` | `courses` | teacher_id, code, title, description, credits, level, capacity, price, status, starts_at, ends_at |
| `enrollment` | `enrollments` | student_id, course_id, enrolled_at, status, progress, completed_at |
| `grade` | `grades` | enrollment_id, assessment, score, max_score, letter, weight, graded_at, remarks |

### Logistics `logistics`

Warehouses, vehicles, drivers and deliveries.

| Template | Table | Columns |
|---|---|---|
| `warehouse` | `warehouses` | name, code, address_line1, address_line2, city, state, postal_code, country, latitude, longitude, phone, capacity, is_active |
| `vehicle` | `vehicles` | warehouse_id, plate_number, type, make, model, year, capacity_kg, status |
| `driver` | `drivers` | user_id, vehicle_id, first_name, last_name, phone, email, license_number, license_expires_at, status |
| `delivery` | `deliveries` | warehouse_id, vehicle_id, driver_id, tracking_number, recipient_name, recipient_phone, address_line1, address_line2, city, state, postal_code, country, latitude, longitude, weight, status, scheduled_at, delivered_at, proof_url, notes |
| `tracking_event` | `tracking_events` | delivery_id, status, location, latitude, longitude, occurred_at, notes |
