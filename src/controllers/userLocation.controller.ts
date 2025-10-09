import type { Request, Response } from "express";
import {
  LocationType,
  AttendanceType,
  AttendanceSession,
} from "../../generated/presence/index.js";
import type {
  FieldTrip,
} from "../../generated/presence/index.js";
import { localPrisma, staffViewPrisma } from "../config/db.js";

function getTodayDate(): Date {
  const today = new Date();
  return new Date(
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()),
  );
}

interface FieldTripCreateInput {
  startDate: string;
  endDate: string;
  description?: string;
}

export const saveFieldTrips = async (req: Request, res: Response) => {
  try {
    const {
      employeeNumber,
      fieldTripDates,
    }: { employeeNumber: string; fieldTripDates: FieldTripCreateInput[] } =
      req.body;

    if (!employeeNumber) {
      return res.status(400).json({
        success: false,
        error: "Employee Number is required",
      });
    }

    if (!Array.isArray(fieldTripDates)) {
      return res.status(400).json({
        success: false,
        error: "Field trip dates must be an array",
      });
    }

    const user = await staffViewPrisma.staffWithPi.findFirst({
      where: { staffEmpId: employeeNumber },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    const result = await localPrisma.$transaction(async (tx) => {
      await tx.fieldTrip.updateMany({
        where: {
          employeeNumber,
          isActive: true,
        },
        data: { isActive: false },
      });

      if (fieldTripDates.length > 0) {
        const fieldTrips = await Promise.all(
          fieldTripDates.map(async (trip) => {
            return await tx.fieldTrip.create({
              data: {
                employeeNumber,
                startDate: new Date(trip.startDate),
                endDate: new Date(trip.endDate),
                description: trip.description || null,
                createdBy: req.user?.username || "admin",
                isActive: true,
              },
            });
          }),
        );
        return fieldTrips;
      }

      return [];
    });

    res.status(200).json({
      success: true,
      data: result,
      message: "Field trips saved successfully",
    });
  } catch (error: any) {
    console.error("Save field trips error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

export const getFieldTrips = async (req: Request, res: Response) => {
  try {
    const { employeeNumber } = req.params;

    if (!employeeNumber) {
      return res.status(400).json({
        success: false,
        error: "Employee Number is required",
      });
    }

    const fieldTrips = await localPrisma.fieldTrip.findMany({
      where: {
        employeeNumber,
        isActive: true,
      },
      orderBy: {
        startDate: "asc",
      },
    });

    res.status(200).json({
      success: true,
      data: {
        fieldTrips,
      },
    });
  } catch (error: any) {
    console.error("Get field trips error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

export const getUserFieldTrips = async (req: Request, res: Response) => {
  try {
    const { employeeNumber } = req.params;

    if (!employeeNumber) {
      return res.status(400).json({
        success: false,
        error: "Employee Number is required",
      });
    }

    const user = await staffViewPrisma.staffWithPi.findFirst({
      where: { staffEmpId: employeeNumber },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    const fieldTrips = await localPrisma.fieldTrip.findMany({
      where: {
        employeeNumber,
        isActive: true,
      },
      orderBy: { startDate: "asc" },
    });

    res.status(200).json({
      success: true,
      data: {
        employeeNumber: user.staffEmpId,
        username: user.staffUsername,
        empClass: user.empClass,
        fieldTrips: fieldTrips || [],
      },
    });
  } catch (error: any) {
    console.error("Get user field trips error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

export const getUserFieldTripsByUsername = async (
  req: Request,
  res: Response,
) => {
  try {
    const { username } = req.params;

    if (!username) {
      return res.status(400).json({
        success: false,
        error: "Username is required",
      });
    }

    const user = await staffViewPrisma.staffWithPi.findFirst({
      where: { staffUsername: username },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    const fieldTrips = await localPrisma.fieldTrip.findMany({
      where: {
        employeeNumber: user.staffEmpId,
        isActive: true,
      },
      orderBy: { startDate: "asc" },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const isOnFieldTrip = fieldTrips.some((trip: FieldTrip) => {
      const start = new Date(trip.startDate);
      const end = new Date(trip.endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return today >= start && today <= end && trip.isActive;
    });

    const locationType = isOnFieldTrip ? "FIELDTRIP" : "CAMPUS";

    res.status(200).json({
      success: true,
      data: {
        employeeNumber: user.staffEmpId,
        username: user.staffUsername,
        empClass: user.empClass,
        locationType: locationType,
        fieldTrips: fieldTrips || [],
      },
    });
  } catch (error: any) {
    console.error("Get user field trips by username error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

export const getUserFieldTripsByEmployeeNumber = async (
  req: Request,
  res: Response,
) => {
  try {
    const { employeeNumber } = req.params;

    if (!employeeNumber) {
      return res.status(400).json({
        success: false,
        error: "Employee number is required",
      });
    }

    const user = await staffViewPrisma.staffWithPi.findFirst({
      where: { staffEmpId: employeeNumber },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "Employee not found",
      });
    }

    const fieldTrips = await localPrisma.fieldTrip.findMany({
      where: {
        employeeNumber,
        isActive: true,
      },
      orderBy: { startDate: "asc" },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const isOnFieldTrip = fieldTrips.some((trip: FieldTrip) => {
      const start = new Date(trip.startDate);
      const end = new Date(trip.endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return today >= start && today <= end && trip.isActive;
    });

    const locationType = isOnFieldTrip ? "FIELDTRIP" : "CAMPUS";

    res.status(200).json({
      success: true,
      data: {
        employeeNumber: user.staffEmpId,
        username: user.staffUsername,
        empClass: user.empClass,
        locationType: locationType,
        fieldTrips: fieldTrips || [],
      },
    });
  } catch (error: any) {
    console.error("Get user field trips by employee number error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

export const checkAndDeactivateExpiredFieldTrips = async (
  req: Request,
  res: Response,
) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expiredFieldTrips: FieldTrip[] = await localPrisma.fieldTrip.findMany(
      {
        where: {
          isActive: true,
          endDate: {
            lt: today,
          },
        },
      },
    );

    const deactivatedTrips = [];

    for (const trip of expiredFieldTrips) {
      await localPrisma.fieldTrip.update({
        where: { fieldTripKey: trip.fieldTripKey },
        data: { isActive: false },
      });

      deactivatedTrips.push({
        employeeNumber: trip.employeeNumber,
        tripKey: trip.fieldTripKey,
        endDate: trip.endDate,
      });
    }

    res.status(200).json({
      success: true,
      message: `Deactivated ${expiredFieldTrips.length} expired field trips`,
      deactivated: deactivatedTrips,
    });
  } catch (error: any) {
    console.error("Check and deactivate expired field trips error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

export const processFieldTripAttendance = async (
  req: Request,
  res: Response,
) => {
  try {
    const today = getTodayDate();

    const activeFieldTrips = await localPrisma.fieldTrip.findMany({
      where: {
        isActive: true,
        startDate: { lte: today },
        endDate: { gte: today },
      },
    });

    if (activeFieldTrips.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No active field trips to process today.",
        data: [],
      });
    }

    const employeeNumbers = [
      ...new Set(activeFieldTrips.map((trip) => trip.employeeNumber)),
    ];
    const users = await staffViewPrisma.staffWithPi.findMany({
      where: { staffEmpId: { in: employeeNumbers } },
      select: { staffEmpId: true, staffUsername: true },
      distinct: ["staffEmpId"],
    });

    const userMap = new Map(users.map((u) => [u.staffEmpId, u.staffUsername]));

    const results = [];
    for (const trip of activeFieldTrips) {
      const existingAttendance = await localPrisma.attendance.findUnique({
        where: {
          employeeNumber_date: {
            employeeNumber: trip.employeeNumber,
            date: today,
          },
        },
      });

      const username = userMap.get(trip.employeeNumber) || "Unknown User";

      if (!existingAttendance) {
        await localPrisma.attendance.create({
          data: {
            employeeNumber: trip.employeeNumber,
            date: today,
            checkinTime: new Date(
              today.getFullYear(),
              today.getMonth(),
              today.getDate(),
              9,
              30,
            ),
            checkoutTime: new Date(
              today.getFullYear(),
              today.getMonth(),
              today.getDate(),
              17,
              30,
            ),
            sessionType: AttendanceSession.FN,
            attendanceType: AttendanceType.FULL_DAY,
            locationType: LocationType.FIELDTRIP,
            takenLocation:
              "Field Trip - " + (trip.description || "Auto-marked"),
          },
        });

        results.push({
          employeeNumber: trip.employeeNumber,
          username,
          status: "marked",
        });
      } else {
        results.push({
          employeeNumber: trip.employeeNumber,
          username,
          status: "already_marked",
        });
      }
    }

    res.status(200).json({
      success: true,
      message: `Field trip attendance processed for ${results.length} users`,
      data: results,
    });
  } catch (error: any) {
    console.error("Process field trip attendance error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

export const deleteFieldTrip = async (req: Request, res: Response) => {
  try {
    const { fieldTripKey } = req.params;

    if (!fieldTripKey) {
      return res.status(400).json({
        success: false,
        error: "Field trip key is required",
      });
    }

    const updatedFieldTrip = await localPrisma.fieldTrip.update({
      where: { fieldTripKey },
      data: { isActive: false },
    });

    res.status(200).json({
      success: true,
      message: "Field trip deleted successfully",
      data: updatedFieldTrip,
    });
  } catch (error: any) {
    console.error("Delete field trip error:", error);

    if (error.code === "P2025") {
      return res.status(404).json({
        success: false,
        error: "Field trip not found",
      });
    }

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

export const getAllActiveFieldTrips = async (req: Request, res: Response) => {
  try {
    const { date } = req.query;
    const targetDate = date ? new Date(date as string) : new Date();
    targetDate.setHours(0, 0, 0, 0);

    const activeFieldTrips = await localPrisma.fieldTrip.findMany({
      where: {
        isActive: true,
        startDate: { lte: targetDate },
        endDate: { gte: targetDate },
      },
      orderBy: [{ startDate: "asc" }, { employeeNumber: "asc" }],
    });

    if (activeFieldTrips.length === 0) {
      return res.status(200).json({
        success: true,
        date: targetDate,
        totalActiveTrips: 0,
        data: [],
      });
    }

    const employeeNumbers = [
      ...new Set(activeFieldTrips.map((trip) => trip.employeeNumber)),
    ];
    const users = await staffViewPrisma.staffWithPi.findMany({
      where: { staffEmpId: { in: employeeNumbers } },
      select: { staffEmpId: true, staffUsername: true, empClass: true },
      distinct: ["staffEmpId"],
    });

    const userMap = new Map(
      users.map((u) => [
        u.staffEmpId,
        { username: u.staffUsername, empClass: u.empClass },
      ]),
    );

    const formattedTrips = activeFieldTrips.map((trip) => {
      const userInfo = userMap.get(trip.employeeNumber);
      return {
        fieldTripKey: trip.fieldTripKey,
        employeeNumber: trip.employeeNumber,
        username: userInfo?.username || "Unknown User",
        empClass: userInfo?.empClass || "Unknown",
        startDate: trip.startDate,
        endDate: trip.endDate,
        description: trip.description,
        createdBy: trip.createdBy,
        daysRemaining: Math.ceil(
          (trip.endDate.getTime() - targetDate.getTime()) /
            (1000 * 60 * 60 * 24),
        ),
      };
    });

    res.status(200).json({
      success: true,
      date: targetDate,
      totalActiveTrips: formattedTrips.length,
      data: formattedTrips,
    });
  } catch (error: any) {
    console.error("Get all active field trips error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

export const updateFieldTrip = async (req: Request, res: Response) => {
  try {
    const { fieldTripKey } = req.params;
    const { startDate, endDate, description } = req.body;

    if (!fieldTripKey) {
      return res.status(400).json({
        success: false,
        error: "Field trip key is required",
      });
    }

    const updateData: any = {};
    if (startDate) updateData.startDate = new Date(startDate);
    if (endDate) updateData.endDate = new Date(endDate);
    if (description !== undefined) updateData.description = description;

    const updatedFieldTrip = await localPrisma.fieldTrip.update({
      where: { fieldTripKey },
      data: updateData,
    });

    res.status(200).json({
      success: true,
      message: "Field trip updated successfully",
      data: updatedFieldTrip,
    });
  } catch (error: any) {
    console.error("Update field trip error:", error);

    if (error.code === "P2025") {
      return res.status(404).json({
        success: false,
        error: "Field trip not found",
      });
    }

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};