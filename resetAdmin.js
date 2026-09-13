require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("./models/User");

const updateAdminDetails = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || process.env.DATABASE_URL;
    if (!mongoUri) {
      console.error("MONGO_URI ba ya cikin fayil din .env!");
      process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB successfully...");

    // 1. Id na asusun Admin daga Database
    const adminId = "6a2ac7a3f87200c55d5787bb";

    // 2. Sabon Email/Username da kake so (Idan zaka canza admin@bellajdatahub.online, rubuta sabon anan)
    const newEmail = "admin@bellajdatahub.online"; // <-- Idan kana da sabon email sa a nan
    const newPasswordRaw = "Abello@4949";

    // 3. Yi wa sabon password encryption ta amfani da bcrypt
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(newPasswordRaw, salt);

    // 4. Sabunta asusun a Database
    const updatedAdmin = await User.findByIdAndUpdate(
      adminId,
      {
        $set: {
          email: newEmail.toLowerCase().trim(),
          password: hashedPassword,
          name: "BELLAJ ADMIN",
          role: "admin",
          isSuspended: false,
        },
      },
      { new: true }
    );

    if (!updatedAdmin) {
      console.log("Ba a sami Admin mai wannan ID din ba.");
    } else {
      console.log("==========================================");
      console.log("AN YI NASARAR SABUNTA BAYANAN ADMIN!");
      console.log(`Email/Username: ${updatedAdmin.email}`);
      console.log(`Sabon Password: ${newPasswordRaw}`);
      console.log("==========================================");
    }

    process.exit(0);
  } catch (error) {
    console.error("An samu matsala:", error.message);
    process.exit(1);
  }
};

updateAdminDetails();