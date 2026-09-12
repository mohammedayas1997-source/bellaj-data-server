const axios = require("axios");

const AYAX_BASE_URL =
  process.env.AYAX_BASE_URL || "https://api.ayaxapis.com/api/v1";
const AYAX_API_KEY =
  process.env.AYAX_API_KEY ||
  "ayax_live_70e04a1a58c5f3c9573ae8d658b2905ed2c8c5e74fbe628c1a85958db380f4fd";

const getAyaxHeaders = () => ({
  headers: {
    "x-api-key": AYAX_API_KEY,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  timeout: 45000,
});

// ==========================================
// 1. DATA & AIRTIME
// ==========================================
exports.getAvailablePlans = async () => {
  const res = await axios.get(`${AYAX_BASE_URL}/data/plans`, getAyaxHeaders());
  return res.data;
};

exports.purchaseData = async ({ network, phone, planId, reference }) => {
  const payload = {
    network: String(network).toUpperCase(),
    phone: String(phone).trim(),
    plan_id: planId,
    reference: reference || `BDH_DAT_${Date.now()}`,
  };
  const res = await axios.post(`${AYAX_BASE_URL}/data/buy`, payload, getAyaxHeaders());
  return res.data;
};

exports.purchaseAirtime = async ({ network, phone, amount, reference }) => {
  const payload = {
    network: String(network).toUpperCase(),
    phone: String(phone).trim(),
    amount: Number(amount),
    reference: reference || `BDH_AIR_${Date.now()}`,
  };
  const res = await axios.post(`${AYAX_BASE_URL}/airtime/buy`, payload, getAyaxHeaders());
  return res.data;
};

// ==========================================
// 2. CABLE TV (DSTV, GOTV, STARTIMES)
// ==========================================
exports.validateCableSmartcard = async ({ provider, smartcardNumber }) => {
  const res = await axios.get(
    `${AYAX_BASE_URL}/cable/validate?provider=${provider.toLowerCase()}&smartcard=${smartcardNumber}`,
    getAyaxHeaders()
  );
  return res.data;
};

exports.purchaseCableSubscription = async ({ provider, smartcardNumber, packageId, phone, reference }) => {
  const payload = {
    provider: String(provider).toLowerCase(),
    smartcard_number: String(smartcardNumber).trim(),
    package_id: packageId,
    phone: phone || "",
    reference: reference || `BDH_CAB_${Date.now()}`,
  };
  const res = await axios.post(`${AYAX_BASE_URL}/cable/buy`, payload, getAyaxHeaders());
  return res.data;
};

// ==========================================
// 3. NIMC / NIN VALIDATION & VERIFICATION
// ==========================================
exports.verifyNIN = async ({ ninNumber, reference }) => {
  const payload = {
    nin: String(ninNumber).trim(),
    reference: reference || `BDH_NIN_${Date.now()}`,
  };
  const res = await axios.post(`${AYAX_BASE_URL}/identity/nin/verify`, payload, getAyaxHeaders());
  return res.data;
};

// NIMC VALIDATION (Babu Modification)
exports.validateNIMC = async ({ trackingId, ninNumber, reference }) => {
  const payload = {
    tracking_id: trackingId ? String(trackingId).trim() : undefined,
    nin: ninNumber ? String(ninNumber).trim() : undefined,
    reference: reference || `BDH_NIMC_VAL_${Date.now()}`,
  };
  const res = await axios.post(`${AYAX_BASE_URL}/identity/nimc/validate`, payload, getAyaxHeaders());
  return res.data;
};

// ==========================================
// 4. BVN VERIFICATION
// ==========================================
exports.verifyBVN = async ({ bvnNumber, reference }) => {
  const payload = {
    bvn: String(bvnNumber).trim(),
    reference: reference || `BDH_BVN_${Date.now()}`,
  };
  const res = await axios.post(`${AYAX_BASE_URL}/identity/bvn/verify`, payload, getAyaxHeaders());
  return res.data;
};