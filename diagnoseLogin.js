require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("./models/User");

async function check() {
  try {
    const mongoUri = process.env.MONGO_URI || process.env.DATABASE_URL;
    await mongoose.connect(mongoUri);

    const email = "abellojks@bellajdatahub.online".toLowerCase().trim();
    const rawPass = "Abello@4949";

    const user = await User.findOne({ email });

    if (!user) {
      console.log("❌ KUSKURE: Ba a samu user mai wannan email din ba ko kadan.");
      process.exit(1);
    }

    console.log("-----------------------------------------");
    console.log("✅ User ya wanzu a Database:");
    console.log("ID:", user._id);
    console.log("Email:", user.email);
    console.log("Role:", user.role);
    console.log("Is Suspended:", user.isSuspended);
    console.log("Status:", user.status);

    // Gwada kwatanta password
    const isMatch = await bcrypt.compare(rawPass, user.password);
    console.log("Password Match (Bcrypt compare):", isMatch ? "✅ Yayi daidai!" : "❌ Bai yi daidai ba!");

    if (!isMatch) {
      console.log("Ana sake saita hash din nan take...");
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(rawPass, salt);
      await user.save();
      console.log("✅ An sake adana sabon hash a cikin user.save()");
    }

    console.log("-----------------------------------------");
    process.exit(0);
  } catch (err) {
    console.error("Kuskure:", err.message);
    process.exit(1);
  }
}

check();
