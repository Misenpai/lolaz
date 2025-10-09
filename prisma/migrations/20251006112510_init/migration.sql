-- CreateTable
CREATE TABLE `attendances` (
    `employeeNumber` VARCHAR(255) NOT NULL,
    `date` DATE NOT NULL,
    `checkinTime` DATETIME(3) NULL,
    `checkoutTime` DATETIME(3) NULL,
    `sessionType` ENUM('FN', 'AF') NULL,
    `attendanceType` ENUM('FULL_DAY', 'HALF_DAY') NULL,
    `locationType` ENUM('CAMPUS', 'FIELDTRIP') NOT NULL DEFAULT 'CAMPUS',
    `takenLocation` VARCHAR(255) NULL,
    `photoUrl` VARCHAR(500) NULL,
    `audioUrl` VARCHAR(500) NULL,
    `audioDuration` INTEGER NULL,
    `latitude` FLOAT NULL,
    `longitude` FLOAT NULL,
    `locationAddress` VARCHAR(500) NULL,
    `county` VARCHAR(255) NULL,
    `state` VARCHAR(255) NULL,
    `postcode` VARCHAR(20) NULL,

    INDEX `attendances_date_idx`(`date`),
    INDEX `attendances_employeeNumber_idx`(`employeeNumber`),
    INDEX `attendances_employeeNumber_date_idx`(`employeeNumber`, `date`),
    PRIMARY KEY (`employeeNumber`, `date`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `calendar` (
    `date` DATE NOT NULL,
    `isHoliday` BOOLEAN NOT NULL DEFAULT false,
    `isWeekend` BOOLEAN NOT NULL DEFAULT false,
    `description` VARCHAR(255) NULL,

    INDEX `calendar_date_idx`(`date`),
    INDEX `calendar_isHoliday_idx`(`isHoliday`),
    PRIMARY KEY (`date`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `field_trips` (
    `fieldTripKey` VARCHAR(191) NOT NULL,
    `employeeNumber` VARCHAR(255) NOT NULL,
    `startDate` DATE NOT NULL,
    `endDate` DATE NOT NULL,
    `description` TEXT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdBy` VARCHAR(255) NOT NULL,

    INDEX `field_trips_employeeNumber_idx`(`employeeNumber`),
    INDEX `field_trips_startDate_endDate_idx`(`startDate`, `endDate`),
    INDEX `field_trips_employeeNumber_startDate_endDate_idx`(`employeeNumber`, `startDate`, `endDate`),
    PRIMARY KEY (`fieldTripKey`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
