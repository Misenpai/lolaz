import type { Request, Response } from "express";
import { AttendanceType } from "../../generated/presence/index.js";
import { generateToken } from "../utils/jwt.js";
import { getADAuthService } from "../services/adAuthService.js"; // Changed from iitAuthService
import { localPrisma, staffViewPrisma } from "../config/db.js";
import type { StaffWithPi } from "../../generated/staff_view/index.js";

const aggregateProjectsFromView = (userEntries: StaffWithPi[]) => {
  if (!userEntries || userEntries.length === 0) return [];

  const projectsMap = new Map();
  userEntries.forEach((entry) => {
    if (!projectsMap.has(entry.projectId)) {
      projectsMap.set(entry.projectId, {
        projectCode: entry.projectId,
        department: entry.deptName,
      });
    }
  });

  return Array.from(projectsMap.values());
};

export const loginUser = async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: "Username and password are required",
      });
    }
    try {
      console.log(
        `[AD-Login] Verifying credentials with AD server for: ${username}`,
      );
      const adAuth = getADAuthService();
      const authResult = await adAuth.authenticateUser({ username, password });

      if (!authResult.success || !authResult.valid) {
        console.log(`[AD-Login] AD authentication failed for: ${username}`);
        return res.status(401).json({
          success: false,
          error: "Invalid username or password",
        });
      }
      console.log(`[AD-Login] AD authentication successful for: ${username}`);
    } catch (error: any) {
      console.error("[AD-Login] AD authentication error:", error.message);
      return res.status(503).json({
        success: false,
        error: "Authentication service unavailable. Please try again later.",
      });
    }

    // After successful AD authentication, get user from database
    const userEntries = await staffViewPrisma.staffWithPi.findMany({
      where: { staffUsername: username },
    });

    if (userEntries.length === 0) {
      return res.status(404).json({
        success: false,
        error: "User not found in database. Please contact administrator.",
      });
    }

    const user = userEntries[0];

    const token = generateToken({
      employeeNumber: user!.staffEmpId,
      username: user!.staffUsername,
      empClass: user!.empClass,
    });

    res.status(200).json({
      success: true,
      employeeNumber: user!.staffEmpId,
      username: user!.staffUsername,
      empClass: user!.empClass,
      projects: aggregateProjectsFromView(userEntries),
      token,
      message: "Login successful",
    });
  } catch (error: any) {
    console.error("Login user error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

export const getUserById = async (req: Request, res: Response) => {
  try {
    const { employeeNumber } = req.params;

    if (!employeeNumber) {
      return res.status(400).json({
        success: false,
        error: "Employee Number is required",
      });
    }

    const userEntries = await staffViewPrisma.staffWithPi.findMany({
      where: { staffEmpId: employeeNumber },
    });

    if (userEntries.length === 0) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    const user = userEntries[0];

    const attendances = await localPrisma.attendance.findMany({
      where: { employeeNumber: employeeNumber },
      take: 10,
      orderBy: {
        date: "desc",
      },
    });

    const formattedUser = {
      employeeNumber: user!.staffEmpId,
      username: user!.staffUsername,
      empClass: user!.empClass,
      userProjects: aggregateProjectsFromView(userEntries).map((p) => ({
        projectCode: p.projectCode,
        project: { department: p.department },
      })),
      attendances: attendances.map((att) => ({
        date: att.date,
        checkinTime: att.checkinTime,
        checkoutTime: att.checkoutTime,
        sessionType: att.sessionType,
        attendanceType: att.attendanceType,
        locationType: att.locationType,
        isFullDay: att.attendanceType === AttendanceType.FULL_DAY,
        isHalfDay: att.attendanceType === AttendanceType.HALF_DAY,
        isCheckedOut: !!att.checkoutTime,
        location: {
          takenLocation: att.takenLocation,
          latitude: att.latitude,
          longitude: att.longitude,
          locationAddress: att.locationAddress,
          county: att.county,
          state: att.state,
          postcode: att.postcode,
        },
      })),
    };

    res.status(200).json({
      success: true,
      data: formattedUser,
    });
  } catch (error: any) {
    console.error("Get user error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
