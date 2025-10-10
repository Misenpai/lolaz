import { AttendanceType } from "../../generated/presence/index.js";
import { localPrisma, staffViewPrisma } from "../config/db.js";
import { hrRequests, submittedData } from "../shared/state.js";
const groupStaffDataFromView = (staffEntries) => {
    const staffMap = new Map();
    staffEntries.forEach(entry => {
        if (!staffMap.has(entry.staffEmpId)) {
            staffMap.set(entry.staffEmpId, {
                employeeNumber: entry.staffEmpId,
                username: entry.staffUsername,
                empClass: entry.empClass,
                projects: [],
            });
        }
        staffMap.get(entry.staffEmpId).projects.push({
            projectCode: entry.projectId,
            department: entry.deptName,
        });
    });
    return Array.from(staffMap.values());
};
export const getPIUsersAttendance = async (req, res) => {
    try {
        const { month, year } = req.query;
        if (!req.user) {
            return res.status(401).json({ success: false, error: "Authentication required" });
        }
        const { username: piUsername } = req.user;
        const queryMonth = month ? parseInt(month) : new Date().getMonth() + 1;
        const queryYear = year ? parseInt(year) : new Date().getFullYear();
        const startDate = new Date(queryYear, queryMonth - 1, 1);
        const endDate = new Date(queryYear, queryMonth, 0);
        const staffEntriesForPI = await staffViewPrisma.staffWithPi.findMany({
            where: { piUsername: piUsername },
            orderBy: { staffUsername: 'asc' },
        });
        if (staffEntriesForPI.length === 0) {
            return res.status(200).json({ success: true, month: queryMonth, year: queryYear, totalUsers: 0, data: [] });
        }
        const staffIds = [...new Set(staffEntriesForPI.map(s => s.staffEmpId))];
        const [attendances, fieldTrips] = await Promise.all([
            localPrisma.attendance.findMany({
                where: { employeeNumber: { in: staffIds }, date: { gte: startDate, lte: endDate } },
                orderBy: { date: 'desc' },
            }),
            localPrisma.fieldTrip.findMany({
                where: { employeeNumber: { in: staffIds }, isActive: true },
            }),
        ]);
        const attendancesMap = new Map();
        attendances.forEach(att => {
            if (!attendancesMap.has(att.employeeNumber))
                attendancesMap.set(att.employeeNumber, []);
            attendancesMap.get(att.employeeNumber).push(att);
        });
        const fieldTripsMap = new Map();
        fieldTrips.forEach(ft => {
            if (!fieldTripsMap.has(ft.employeeNumber))
                fieldTripsMap.set(ft.employeeNumber, []);
            fieldTripsMap.get(ft.employeeNumber).push(ft);
        });
        const groupedStaff = groupStaffDataFromView(staffEntriesForPI);
        const formattedUsers = groupedStaff.map((user) => {
            const userAttendances = attendancesMap.get(user.employeeNumber) || [];
            const userFieldTrips = fieldTripsMap.get(user.employeeNumber) || [];
            const fullDays = userAttendances.filter(a => a.attendanceType === AttendanceType.FULL_DAY).length;
            const halfDays = userAttendances.filter(a => a.attendanceType === AttendanceType.HALF_DAY).length;
            const notCheckedOut = userAttendances.filter(a => !a.checkoutTime).length;
            const totalDays = fullDays + halfDays * 0.5 + notCheckedOut * 0.5;
            return {
                employeeNumber: user.employeeNumber,
                username: user.username,
                empClass: user.empClass,
                projects: user.projects,
                hasActiveFieldTrip: userFieldTrips.length > 0,
                monthlyStatistics: { totalDays, fullDays, halfDays, notCheckedOut },
                attendances: userAttendances.map(att => ({
                    date: att.date,
                    checkinTime: att.checkinTime,
                    checkoutTime: att.checkoutTime,
                    sessionType: att.sessionType,
                    attendanceType: att.attendanceType,
                    isFullDay: att.attendanceType === AttendanceType.FULL_DAY,
                    isHalfDay: att.attendanceType === AttendanceType.HALF_DAY,
                    isCheckedOut: !!att.checkoutTime,
                    takenLocation: att.takenLocation,
                    location: {
                        takenLocation: att.takenLocation,
                        latitude: att.latitude,
                        longitude: att.longitude,
                        county: att.county,
                        state: att.state,
                        postcode: att.postcode,
                        address: att.locationAddress ||
                            (att.county || att.state || att.postcode
                                ? `${att.county || ""}, ${att.state || ""}, ${att.postcode || ""}`
                                    .replace(/^, |, , |, $/g, "")
                                    .trim()
                                : null),
                    },
                    photo: att.photoUrl ? { url: att.photoUrl } : null,
                    audio: att.audioUrl ? { url: att.audioUrl, duration: att.audioDuration } : null,
                })),
            };
        });
        res.status(200).json({
            success: true,
            month: queryMonth,
            year: queryYear,
            totalUsers: formattedUsers.length,
            data: formattedUsers,
        });
    }
    catch (error) {
        console.error("Get PI users attendance error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};
export const getPiNotifications = async (req, res) => {
    const piUsername = req.user?.username;
    if (!piUsername) {
        return res.status(401).json({ success: false, error: "Unauthorized PI" });
    }
    const notifications = hrRequests[piUsername] ?
        Object.keys(hrRequests[piUsername]).map(key => {
            const [month, year] = key.split('-');
            return { month, year };
        }) : [];
    return res.json({ success: true, data: notifications });
};
export const submitDataToHR = async (req, res) => {
    try {
        const piUsername = req.user?.username;
        if (!piUsername) {
            return res.status(401).json({ success: false, error: "Unauthorized PI" });
        }
        const { month, year } = req.body;
        const requestKey = `${month}-${year}`;
        if (!hrRequests[piUsername]?.[requestKey]) {
            return res.status(404).json({ success: false, error: "No active data request found from HR for this period." });
        }
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0);
        const staffEntriesForPI = await staffViewPrisma.staffWithPi.findMany({
            where: { piUsername: piUsername },
        });
        if (staffEntriesForPI.length === 0) {
            if (!submittedData[piUsername])
                submittedData[piUsername] = {};
            submittedData[piUsername][requestKey] = { users: [] };
            delete hrRequests[piUsername][requestKey];
            return res.json({ success: true, message: `Attendance data for ${month}/${year} submitted to HR successfully.` });
        }
        const staffIds = [...new Set(staffEntriesForPI.map(s => s.staffEmpId))];
        const staffUsernamesMap = new Map(staffEntriesForPI.map(s => [s.staffEmpId, s.staffUsername]));
        const attendances = await localPrisma.attendance.findMany({
            where: { employeeNumber: { in: staffIds }, date: { gte: startDate, lte: endDate } }
        });
        const attendancesMap = new Map();
        attendances.forEach(att => {
            if (!attendancesMap.has(att.employeeNumber))
                attendancesMap.set(att.employeeNumber, []);
            attendancesMap.get(att.employeeNumber).push(att);
        });
        const formattedUsers = staffIds.map(staffId => {
            const userAttendances = attendancesMap.get(staffId) || [];
            const fullDays = userAttendances.filter(a => a.attendanceType === AttendanceType.FULL_DAY).length;
            const halfDays = userAttendances.filter(a => a.attendanceType === AttendanceType.HALF_DAY).length;
            const notCheckedOut = userAttendances.filter(a => !a.checkoutTime).length;
            const totalDays = fullDays + halfDays + notCheckedOut;
            return {
                username: staffUsernamesMap.get(staffId),
                monthlyStatistics: {
                    totalDays: totalDays,
                }
            };
        });
        if (!submittedData[piUsername])
            submittedData[piUsername] = {};
        submittedData[piUsername][requestKey] = { users: formattedUsers };
        delete hrRequests[piUsername][requestKey];
        console.log(`Data submitted by PI: ${piUsername} for ${requestKey}`);
        return res.json({ success: true, message: `Attendance data for ${month}/${year} submitted to HR successfully.` });
    }
    catch (error) {
        console.error("Submit data to HR error:", error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
};
//# sourceMappingURL=pi.controller.js.map