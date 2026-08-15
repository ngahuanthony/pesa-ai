const db = require("../db");
const auth = require("../auth");

function validateSignupInput({ businessName, category, email, password, consent }) {
  if (!businessName || !category || !email || !password) {
    throw db.httpError(400, "businessName, category, email and password are all required");
  }
  if (String(password).length < 8) {
    throw db.httpError(400, "Password must be at least 8 characters");
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    throw db.httpError(400, "That doesn't look like a valid email address");
  }
  // Consent must be a deliberate, affirmative action (a checked checkbox),
  // not assumed by using the site — see the Privacy Policy link on the
  // signup form. Recorded with a timestamp below so it's demonstrable,
  // not just claimed.
  if (!consent) {
    throw db.httpError(400, "You must agree to the Privacy Policy to create an account");
  }
}

function signup({ body }) {
  const { businessName, category, businessPhone, paybillNumber, fullName, buildingName, stallNumber, publicPhone, nationalId, email, password, consent, plan } = body || {};
  validateSignupInput({ businessName, category, email, password, consent });

  const { passwordHash, passwordSalt } = auth.hashPassword(password);

  const { business, account } = db.mutate((state) => {
    const business = db.createBusiness(state, { name: businessName, category, phone: businessPhone || "", paybillNumber, ownerName: fullName, buildingName, shopNumber: stallNumber, publicPhone, idOrKraPin: nationalId, plan });
    const account = db.createAccount(state, { businessId: business.id, email, passwordHash, passwordSalt, consentedAt: db.now() });
    return { business, account };
  });

  const session = db.createSession({ accountId: account.id, businessId: business.id });

  return {
    status: 201,
    cookie: auth.sessionCookieHeader(session.token),
    data: {
      business: db.sanitizeBusiness(business),
      account: { id: account.id, email: account.email },
      subscription: db.getSubscription(business.id),
    },
  };
}

function login({ body }) {
  const { email, password } = body || {};
  if (!email || !password) throw db.httpError(400, "email and password are required");

  const account = db.getAccountByEmail(email);
  // Same error for "no such account" and "wrong password" — don't leak
  // which emails are registered.
  if (!account || !auth.verifyPassword(password, account.passwordHash, account.passwordSalt)) {
    throw db.httpError(401, "Invalid email or password");
  }

  const session = db.createSession({ accountId: account.id, businessId: account.businessId });
  const business = db.getBusiness(account.businessId);

  return {
    cookie: auth.sessionCookieHeader(session.token),
    data: {
      business: db.sanitizeBusiness(business),
      account: { id: account.id, email: account.email },
      subscription: db.getSubscription(business.id),
    },
  };
}

function logout({ session }) {
  if (session) db.deleteSession(session.token);
  return { cookie: auth.sessionCookieHeader(null, { clear: true }), data: { ok: true } };
}

function me({ session }) {
  if (!session) return { authenticated: false };

  if (session.isAdmin) {
    return { data: { authenticated: true, isAdmin: true } };
  }

  const account = db.getAccountById(session.accountId);
  const business = db.getBusiness(session.businessId);
  return {
    data: {
      authenticated: true,
      isAdmin: false,
      account: { id: account.id, email: account.email },
      business: db.sanitizeBusiness(business),
      subscription: db.getSubscription(business.id),
    },
  };
}

module.exports = { signup, login, logout, me };
