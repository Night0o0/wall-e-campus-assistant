import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { UserRepository } from "../repositories/user.repository.js";
import { env } from "../config/env.js";

export class AuthService {

    private userRepository = new UserRepository();

    async register(data: {
        universityId: string;
        fullName: string;
        email: string;
        password: string;
        organizationCode: string;
    }) {

        // 1- Check organization exists
        const organization =
            await this.userRepository.findOrganizationByCode(
                data.organizationCode
            );

        if (!organization) {
            throw new Error("Organization not found");
        }

        // 2- Check University ID is not already used
        const existingUniversityId =
            await this.userRepository.findByUniversityId(
                data.universityId
            );

        if (existingUniversityId) {
            throw new Error("University ID already exists");
        }

        // 3- Check email is not already used
        const existingUser =
            await this.userRepository.findByEmail(
                data.email
            );

        if (existingUser) {
            throw new Error("Email already exists");
        }

        // 4- Hash password
        const passwordHash = await bcrypt.hash(data.password, 10);

        // 5- Create user
        const user = await this.userRepository.create({
            universityId: data.universityId,
            fullName: data.fullName,
            email: data.email,
            passwordHash,
            role: "STUDENT",
            organizationId: organization.id
        });

        return user;

    }

    async login(data: {
        email: string;
        password: string;
    }) {

        // 1- Find user by email
        const user = await this.userRepository.findByEmail(data.email);

        if (!user) {
            throw new Error("Invalid email or password");
        }

        // 2- Verify password
        const isPasswordValid = await bcrypt.compare(data.password, user.passwordHash);

        if (!isPasswordValid) {
            throw new Error("Invalid email or password");
        }

        // 3- Generate JWT token
        const token = jwt.sign(
            {
                id: user.id,
                email: user.email,
                role: user.role
            },
            env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        return {
            token,
            user: {
                id: user.id,
                universityId: user.universityId,
                fullName: user.fullName,
                email: user.email,
                role: user.role,
                isVerified: user.isVerified
            }
        };

    }

    async getProfile(userId: string) {

        const user = await this.userRepository.findById(userId);

        if (!user) {
            throw new Error("User not found");
        }

        return {
            id: user.id,
            universityId: user.universityId,
            fullName: user.fullName,
            email: user.email,
            role: user.role,
            isVerified: user.isVerified,
            organizationId: user.organizationId
        };

    }

}