import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {

    console.log("🌱 Seeding database...");

    // إنشاء الجامعة إذا لم تكن موجودة
    const organization = await prisma.organization.upsert({

        where: {
            code: "NCTU"
        },

        update: {},

        create: {

            name: "New Cairo Technological University",

            code: "NCTU",

            email: "info@nctu.edu.eg"

        }

    });

    // تشفير الباسورد
    const passwordHash = await bcrypt.hash("Admin@123", 10);

    // إنشاء الـ Super Admin إذا لم يكن موجوداً
    await prisma.user.upsert({

        where: {

            email: "admin@nctu.edu.eg"

        },

        update: {},

        create: {

            universityId: "ADMIN001",

            fullName: "System Administrator",

            email: "admin@nctu.edu.eg",

            passwordHash,

            role: "SYSTEM_OWNER",

            organizationId: organization.id

        }

    });

    console.log("✅ Database Seeded Successfully");

}

main()
    .catch((error) => {

        console.error(error);

        process.exit(1);

    })
    .finally(async () => {

        await prisma.$disconnect();

    });