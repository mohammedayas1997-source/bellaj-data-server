const mongoose = require("mongoose");
require("dotenv").config();

const User = require("../../models/User");

const DEFAULT_PASSWORD = "Password2026";
const DEFAULT_PIN = "0000";

const users = [
  {
    surname: "Super",
    firstName: "Admin",
    otherName: "",
    email: "superadmin@bellajdatahub.online",
    phone: "09000000003",
    role: "superadmin",
  },
  {
    surname: "Admin",
    firstName: "Bellaj",
    otherName: "",
    email: "admin@bellajdatahub.online",
    phone: "09000000000",
    role: "admin",
  },
  {
    surname: "Leader",
    firstName: "Bellaj",
    otherName: "",
    email: "leader@bellajdatahub.online",
    phone: "09000000001",
    role: "leader",
  },
  {
    surname: "Support",
    firstName: "Bellaj",
    otherName: "",
    email: "support@bellajdatahub.online",
    phone: "09000000002",
    role: "support",
  },
];

const seedUsers = async () => {
  try {
    const mongoUri =
      process.env.MONGO_URI ||
      process.env.MONGODB_URI ||
      process.env.DATABASE_URL;

    if (!mongoUri) {
      console.error("MongoDB connection string is missing in .env");
      process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log("MongoDB connected successfully");

    for (const user of users) {
      const userData = {
        ...user,
        password: DEFAULT_PASSWORD,
        walletBalance: 0,
        pin: DEFAULT_PIN,
        isSuspended: false,
        state: "Kano",
        lga: "Kano Municipal",
        address: "Bellaj Data Hub",
      };

      const existingUser = await User.findOne({
        email: userData.email,
      }).select("+password +pin");

      if (existingUser) {
        existingUser.surname = userData.surname;
        existingUser.firstName = userData.firstName;
        existingUser.otherName = userData.otherName;
        existingUser.phone = userData.phone;
        existingUser.password = userData.password;
        existingUser.role = userData.role;
        existingUser.walletBalance = userData.walletBalance;
        existingUser.pin = userData.pin;
        existingUser.isSuspended = false;
        existingUser.state = userData.state;
        existingUser.lga = userData.lga;
        existingUser.address = userData.address;

        await existingUser.save();

        console.log(`${userData.role} updated successfully`);
      } else {
        await User.create(userData);
        console.log(`${userData.role} created successfully`);
      }
    }

    console.log("");
    console.log("Bellaj system users ready:");
    console.log("Super Admin: superadmin@bellajdatahub.online");
    console.log("Admin: admin@bellajdatahub.online");
    console.log("Leader: leader@bellajdatahub.online");
    console.log("Support: support@bellajdatahub.online");
    console.log(`Password: ${DEFAULT_PASSWORD}`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("Seed users error:", error);
    process.exit(1);
  }
};

seedUsers();