import bcrypt from "bcrypt";
import { prisma } from "../src/config/prisma.ts";

const LEAVE_TYPES = [
  {
    name: "Casual Leave",
    requiresApproval: true,
    drawsFromBalance: true,
    defaultAllowanceDays: 12,
  },
  {
    name: "Sick Leave",
    requiresApproval: true,
    drawsFromBalance: true,
    defaultAllowanceDays: 10,
  },
  {
    name: "Unpaid Leave",
    requiresApproval: true,
    drawsFromBalance: true,
    defaultAllowanceDays: 15,
  },
];

async function main() {
  const currentYear = new Date().getFullYear();

  // Hash passwords
  const managerPassword = await bcrypt.hash("Manager@123", 10);
  const employeePassword = await bcrypt.hash("Employee@123", 10);
  const employee2Password = await bcrypt.hash("Employee2@123", 10);

  // Create Manager
  const manager = await prisma.user.upsert({
    where: {
      email: "manager@gmail.com",
    },
    update: {},
    create: {
      name: "John Manager",
      email: "manager@gmail.com",
      passwordHash: managerPassword,
      role: "MANAGER",
    },
  });

  // Create Employee
  const employee = await prisma.user.upsert({
    where: {
      email: "employee@gmail.com",
    },
    update: {},
    create: {
      name: "Jane Employee",
      email: "employee@gmail.com",
      passwordHash: employeePassword,
      role: "EMPLOYEE",
      managerId: manager.id,
    },
  });

  // Create second Employee
  const employee2 = await prisma.user.upsert({
    where: {
      email: "employee2@gmail.com",
    },
    update: {},
    create: {
      name: "Sam Employee",
      email: "employee2@gmail.com",
      passwordHash: employee2Password,
      role: "EMPLOYEE",
      managerId: manager.id,
    },
  });

  // Create Leave Types
  const leaveTypes = await Promise.all(
    LEAVE_TYPES.map((leaveType) =>
      prisma.leaveType.upsert({
        where: { name: leaveType.name },
        update: {},
        create: leaveType,
      }),
    ),
  );

  // Grant each user (including the manager) a starting balance for each leave type
  await Promise.all(
    [manager, employee, employee2].flatMap((emp) =>
      leaveTypes.map((leaveType) =>
        prisma.leaveBalance.upsert({
          where: {
            userId_leaveTypeId_year: {
              userId: emp.id,
              leaveTypeId: leaveType.id,
              year: currentYear,
            },
          },
          update: {},
          create: {
            userId: emp.id,
            leaveTypeId: leaveType.id,
            year: currentYear,
            allocatedDays: leaveType.defaultAllowanceDays,
          },
        }),
      ),
    ),
  );

  console.log("Seed completed successfully:");
  console.log({
    manager: {
      id: manager.id,
      email: manager.email,
      role: manager.role,
    },
    employee: {
      id: employee.id,
      email: employee.email,
      role: employee.role,
      managerId: employee.managerId,
    },
    employee2: {
      id: employee2.id,
      email: employee2.email,
      role: employee2.role,
      managerId: employee2.managerId,
    },
    leaveTypes: leaveTypes.map((leaveType) => leaveType.name),
  });
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
