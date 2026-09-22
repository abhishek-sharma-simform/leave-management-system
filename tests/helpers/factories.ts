import bcrypt from "bcrypt";
import { prisma } from "../../src/config/prisma.ts";

let emailCounter = 0;

export async function createUser(
  overrides: {
    name?: string;
    email?: string;
    password?: string;
    role?: "EMPLOYEE" | "MANAGER";
    managerId?: number | null;
  } = {},
) {
  emailCounter += 1;
  const password = overrides.password ?? "Password@123";
  const passwordHash = await bcrypt.hash(password, 4);

  const user = await prisma.user.create({
    data: {
      name: overrides.name ?? `Test User ${emailCounter}`,
      email: overrides.email ?? `test-user-${emailCounter}@example.com`,
      passwordHash,
      role: overrides.role ?? "EMPLOYEE",
      managerId: overrides.managerId ?? null,
    },
  });

  return { ...user, plainPassword: password };
}

export async function createLeaveType(
  overrides: {
    name?: string;
    requiresApproval?: boolean;
    drawsFromBalance?: boolean;
    defaultAllowanceDays?: number;
  } = {},
) {
  emailCounter += 1;

  return prisma.leaveType.create({
    data: {
      name: overrides.name ?? `Leave Type ${emailCounter}`,
      requiresApproval: overrides.requiresApproval ?? true,
      drawsFromBalance: overrides.drawsFromBalance ?? true,
      defaultAllowanceDays: overrides.defaultAllowanceDays ?? 10,
    },
  });
}

export async function createLeaveBalance(overrides: {
  userId: number;
  leaveTypeId: number;
  year?: number;
  allocatedDays?: number;
  usedDays?: number;
}) {
  return prisma.leaveBalance.create({
    data: {
      userId: overrides.userId,
      leaveTypeId: overrides.leaveTypeId,
      year: overrides.year ?? new Date().getFullYear(),
      allocatedDays: overrides.allocatedDays ?? 10,
      usedDays: overrides.usedDays ?? 0,
    },
  });
}

export async function createLeaveRequest(overrides: {
  userId: number;
  leaveTypeId: number;
  startDate: Date;
  endDate: Date;
  daysRequested: number;
  status?: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  note?: string | null;
}) {
  return prisma.leaveRequest.create({
    data: {
      userId: overrides.userId,
      leaveTypeId: overrides.leaveTypeId,
      startDate: overrides.startDate,
      endDate: overrides.endDate,
      daysRequested: overrides.daysRequested,
      status: overrides.status ?? "PENDING",
      note: overrides.note ?? null,
    },
  });
}
