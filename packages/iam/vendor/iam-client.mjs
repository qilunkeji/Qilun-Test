// ../登入框架协议/node_modules/oauth4webapi/build/index.js
var USER_AGENT;
if (typeof navigator === "undefined" || !navigator.userAgent?.startsWith?.("Mozilla/5.0 ")) {
  const NAME = "oauth4webapi";
  const VERSION = "v3.8.8";
  USER_AGENT = `${NAME}/${VERSION}`;
}
function looseInstanceOf(input, expected) {
  if (input == null) {
    return false;
  }
  try {
    return input instanceof expected || Object.getPrototypeOf(input)[Symbol.toStringTag] === expected.prototype[Symbol.toStringTag];
  } catch {
    return false;
  }
}
var ERR_INVALID_ARG_VALUE = "ERR_INVALID_ARG_VALUE";
var ERR_INVALID_ARG_TYPE = "ERR_INVALID_ARG_TYPE";
function CodedTypeError(message, code, cause) {
  const err = new TypeError(message, { cause });
  Object.assign(err, { code });
  return err;
}
var allowInsecureRequests = Symbol();
var clockSkew = Symbol();
var clockTolerance = Symbol();
var customFetch = Symbol();
var modifyAssertion = Symbol();
var jweDecrypt = Symbol();
var jwksCache = Symbol();
var encoder = new TextEncoder();
var decoder = new TextDecoder();
function buf(input) {
  if (typeof input === "string") {
    return encoder.encode(input);
  }
  return decoder.decode(input);
}
var encodeBase64Url;
if (Uint8Array.prototype.toBase64) {
  encodeBase64Url = (input) => {
    if (input instanceof ArrayBuffer) {
      input = new Uint8Array(input);
    }
    return input.toBase64({ alphabet: "base64url", omitPadding: true });
  };
} else {
  const CHUNK_SIZE = 32768;
  encodeBase64Url = (input) => {
    if (input instanceof ArrayBuffer) {
      input = new Uint8Array(input);
    }
    const arr = [];
    for (let i = 0; i < input.byteLength; i += CHUNK_SIZE) {
      arr.push(String.fromCharCode.apply(null, input.subarray(i, i + CHUNK_SIZE)));
    }
    return btoa(arr.join("")).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  };
}
var decodeBase64Url;
if (Uint8Array.fromBase64) {
  decodeBase64Url = (input) => {
    try {
      return Uint8Array.fromBase64(input, { alphabet: "base64url" });
    } catch (cause) {
      throw CodedTypeError("The input to be decoded is not correctly encoded.", ERR_INVALID_ARG_VALUE, cause);
    }
  };
} else {
  decodeBase64Url = (input) => {
    try {
      const binary = atob(input.replace(/-/g, "+").replace(/_/g, "/").replace(/\s/g, ""));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    } catch (cause) {
      throw CodedTypeError("The input to be decoded is not correctly encoded.", ERR_INVALID_ARG_VALUE, cause);
    }
  };
}
function b64u(input) {
  if (typeof input === "string") {
    return decodeBase64Url(input);
  }
  return encodeBase64Url(input);
}
var UnsupportedOperationError = class extends Error {
  code;
  constructor(message, options) {
    super(message, options);
    this.name = this.constructor.name;
    this.code = UNSUPPORTED_OPERATION;
    Error.captureStackTrace?.(this, this.constructor);
  }
};
var OperationProcessingError = class extends Error {
  code;
  constructor(message, options) {
    super(message, options);
    this.name = this.constructor.name;
    if (options?.code) {
      this.code = options?.code;
    }
    Error.captureStackTrace?.(this, this.constructor);
  }
};
function OPE(message, code, cause) {
  return new OperationProcessingError(message, { code, cause });
}
function isJsonObject(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return false;
  }
  return true;
}
function prepareHeaders(input) {
  if (looseInstanceOf(input, Headers)) {
    input = Object.fromEntries(input.entries());
  }
  const headers2 = new Headers(input ?? {});
  if (USER_AGENT && !headers2.has("user-agent")) {
    headers2.set("user-agent", USER_AGENT);
  }
  if (headers2.has("authorization")) {
    throw CodedTypeError('"options.headers" must not include the "authorization" header name', ERR_INVALID_ARG_VALUE);
  }
  return headers2;
}
function signal(url, value) {
  if (value !== void 0) {
    if (typeof value === "function") {
      value = value(url.href);
    }
    if (!(value instanceof AbortSignal)) {
      throw CodedTypeError('"options.signal" must return or be an instance of AbortSignal', ERR_INVALID_ARG_TYPE);
    }
    return value;
  }
  return void 0;
}
function replaceDoubleSlash(pathname) {
  if (pathname.includes("//")) {
    return pathname.replace("//", "/");
  }
  return pathname;
}
function prependWellKnown(url, wellKnown, allowTerminatingSlash = false) {
  if (url.pathname === "/") {
    url.pathname = wellKnown;
  } else {
    url.pathname = replaceDoubleSlash(`${wellKnown}/${allowTerminatingSlash ? url.pathname : url.pathname.replace(/(\/)$/, "")}`);
  }
  return url;
}
function appendWellKnown(url, wellKnown) {
  url.pathname = replaceDoubleSlash(`${url.pathname}/${wellKnown}`);
  return url;
}
async function performDiscovery(input, urlName, transform, options) {
  if (!(input instanceof URL)) {
    throw CodedTypeError(`"${urlName}" must be an instance of URL`, ERR_INVALID_ARG_TYPE);
  }
  checkProtocol(input, options?.[allowInsecureRequests] !== true);
  const url = transform(new URL(input.href));
  const headers2 = prepareHeaders(options?.headers);
  headers2.set("accept", "application/json");
  return (options?.[customFetch] || fetch)(url.href, {
    body: void 0,
    headers: Object.fromEntries(headers2.entries()),
    method: "GET",
    redirect: "manual",
    signal: signal(url, options?.signal)
  });
}
async function discoveryRequest(issuerIdentifier, options) {
  return performDiscovery(issuerIdentifier, "issuerIdentifier", (url) => {
    switch (options?.algorithm) {
      case void 0:
      case "oidc":
        appendWellKnown(url, ".well-known/openid-configuration");
        break;
      case "oauth2":
        prependWellKnown(url, ".well-known/oauth-authorization-server");
        break;
      default:
        throw CodedTypeError('"options.algorithm" must be "oidc" (default), or "oauth2"', ERR_INVALID_ARG_VALUE);
    }
    return url;
  }, options);
}
function assertNumber(input, allow0, it, code, cause) {
  try {
    if (typeof input !== "number" || !Number.isFinite(input)) {
      throw CodedTypeError(`${it} must be a number`, ERR_INVALID_ARG_TYPE, cause);
    }
    if (input > 0)
      return;
    if (allow0) {
      if (input !== 0) {
        throw CodedTypeError(`${it} must be a non-negative number`, ERR_INVALID_ARG_VALUE, cause);
      }
      return;
    }
    throw CodedTypeError(`${it} must be a positive number`, ERR_INVALID_ARG_VALUE, cause);
  } catch (err) {
    if (code) {
      throw OPE(err.message, code, cause);
    }
    throw err;
  }
}
function assertString(input, it, code, cause) {
  try {
    if (typeof input !== "string") {
      throw CodedTypeError(`${it} must be a string`, ERR_INVALID_ARG_TYPE, cause);
    }
    if (input.length === 0) {
      throw CodedTypeError(`${it} must not be empty`, ERR_INVALID_ARG_VALUE, cause);
    }
  } catch (err) {
    if (code) {
      throw OPE(err.message, code, cause);
    }
    throw err;
  }
}
async function processDiscoveryResponse(expectedIssuerIdentifier, response) {
  const expected = expectedIssuerIdentifier;
  if (!(expected instanceof URL) && expected !== _nodiscoverycheck) {
    throw CodedTypeError('"expectedIssuerIdentifier" must be an instance of URL', ERR_INVALID_ARG_TYPE);
  }
  if (!looseInstanceOf(response, Response)) {
    throw CodedTypeError('"response" must be an instance of Response', ERR_INVALID_ARG_TYPE);
  }
  if (response.status !== 200) {
    throw OPE('"response" is not a conform Authorization Server Metadata response (unexpected HTTP status code)', RESPONSE_IS_NOT_CONFORM, response);
  }
  assertReadableResponse(response);
  const json = await getResponseJsonBody(response);
  assertString(json.issuer, '"response" body "issuer" property', INVALID_RESPONSE, { body: json });
  if (expected !== _nodiscoverycheck && new URL(json.issuer).href !== expected.href) {
    throw OPE('"response" body "issuer" property does not match the expected value', JSON_ATTRIBUTE_COMPARISON, { expected: expected.href, body: json, attribute: "issuer" });
  }
  return json;
}
function assertApplicationJson(response) {
  assertContentType(response, "application/json");
}
function notJson(response, ...types) {
  let msg = '"response" content-type must be ';
  if (types.length > 2) {
    const last = types.pop();
    msg += `${types.join(", ")}, or ${last}`;
  } else if (types.length === 2) {
    msg += `${types[0]} or ${types[1]}`;
  } else {
    msg += types[0];
  }
  return OPE(msg, RESPONSE_IS_NOT_JSON, response);
}
function assertContentTypes(response, ...types) {
  if (!types.includes(getContentType(response))) {
    throw notJson(response, ...types);
  }
}
function assertContentType(response, contentType) {
  if (getContentType(response) !== contentType) {
    throw notJson(response, contentType);
  }
}
function randomBytes() {
  return b64u(crypto.getRandomValues(new Uint8Array(32)));
}
function generateRandomCodeVerifier() {
  return randomBytes();
}
function generateRandomState() {
  return randomBytes();
}
function generateRandomNonce() {
  return randomBytes();
}
async function calculatePKCECodeChallenge(codeVerifier) {
  assertString(codeVerifier, "codeVerifier");
  return b64u(await crypto.subtle.digest("SHA-256", buf(codeVerifier)));
}
function getClockSkew(client) {
  const skew = client?.[clockSkew];
  return typeof skew === "number" && Number.isFinite(skew) ? skew : 0;
}
function getClockTolerance(client) {
  const tolerance = client?.[clockTolerance];
  return typeof tolerance === "number" && Number.isFinite(tolerance) && Math.sign(tolerance) !== -1 ? tolerance : 30;
}
function epochTime() {
  return Math.floor(Date.now() / 1e3);
}
function assertAs(as) {
  if (typeof as !== "object" || as === null) {
    throw CodedTypeError('"as" must be an object', ERR_INVALID_ARG_TYPE);
  }
  assertString(as.issuer, '"as.issuer"');
}
function assertClient(client) {
  if (typeof client !== "object" || client === null) {
    throw CodedTypeError('"client" must be an object', ERR_INVALID_ARG_TYPE);
  }
  assertString(client.client_id, '"client.client_id"');
}
function ClientSecretPost(clientSecret) {
  assertString(clientSecret, '"clientSecret"');
  return (_as, client, body, _headers) => {
    body.set("client_id", client.client_id);
    body.set("client_secret", clientSecret);
  };
}
function None() {
  return (_as, client, body, _headers) => {
    body.set("client_id", client.client_id);
  };
}
var URLParse = URL.parse ? (url, base) => URL.parse(url, base) : (url, base) => {
  try {
    return new URL(url, base);
  } catch {
    return null;
  }
};
function checkProtocol(url, enforceHttps) {
  if (enforceHttps && url.protocol !== "https:") {
    throw OPE("only requests to HTTPS are allowed", HTTP_REQUEST_FORBIDDEN, url);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw OPE("only HTTP and HTTPS requests are allowed", REQUEST_PROTOCOL_FORBIDDEN, url);
  }
}
function validateEndpoint(value, endpoint, useMtlsAlias, enforceHttps) {
  let url;
  if (typeof value !== "string" || !(url = URLParse(value))) {
    throw OPE(`authorization server metadata does not contain a valid ${useMtlsAlias ? `"as.mtls_endpoint_aliases.${endpoint}"` : `"as.${endpoint}"`}`, value === void 0 ? MISSING_SERVER_METADATA : INVALID_SERVER_METADATA, { attribute: useMtlsAlias ? `mtls_endpoint_aliases.${endpoint}` : endpoint });
  }
  checkProtocol(url, enforceHttps);
  return url;
}
function resolveEndpoint(as, endpoint, useMtlsAlias, enforceHttps) {
  if (useMtlsAlias && as.mtls_endpoint_aliases && endpoint in as.mtls_endpoint_aliases) {
    return validateEndpoint(as.mtls_endpoint_aliases[endpoint], endpoint, useMtlsAlias, enforceHttps);
  }
  return validateEndpoint(as[endpoint], endpoint, useMtlsAlias, enforceHttps);
}
function isDPoPNonceError(err) {
  if (err instanceof WWWAuthenticateChallengeError) {
    return err.cause.some((challenge) => challenge.scheme === "dpop" && challenge.parameters.error === "use_dpop_nonce");
  }
  if (err instanceof ResponseBodyError) {
    return err.error === "use_dpop_nonce";
  }
  return false;
}
var ResponseBodyError = class extends Error {
  cause;
  code;
  error;
  status;
  error_description;
  response;
  constructor(message, options) {
    super(message, options);
    this.name = this.constructor.name;
    this.code = RESPONSE_BODY_ERROR;
    this.cause = options.cause;
    this.error = options.cause.error;
    this.status = options.response.status;
    this.error_description = options.cause.error_description;
    Object.defineProperty(this, "response", { enumerable: false, value: options.response });
    Error.captureStackTrace?.(this, this.constructor);
  }
};
var AuthorizationResponseError = class extends Error {
  cause;
  code;
  error;
  error_description;
  constructor(message, options) {
    super(message, options);
    this.name = this.constructor.name;
    this.code = AUTHORIZATION_RESPONSE_ERROR;
    this.cause = options.cause;
    this.error = options.cause.get("error");
    this.error_description = options.cause.get("error_description") ?? void 0;
    Error.captureStackTrace?.(this, this.constructor);
  }
};
var WWWAuthenticateChallengeError = class extends Error {
  cause;
  code;
  response;
  status;
  constructor(message, options) {
    super(message, options);
    this.name = this.constructor.name;
    this.code = WWW_AUTHENTICATE_CHALLENGE;
    this.cause = options.cause;
    this.status = options.response.status;
    this.response = options.response;
    Object.defineProperty(this, "response", { enumerable: false });
    Error.captureStackTrace?.(this, this.constructor);
  }
};
var tokenMatch = "[a-zA-Z0-9!#$%&\\'\\*\\+\\-\\.\\^_`\\|~]+";
var token68Match = "[a-zA-Z0-9\\-\\._\\~\\+\\/]+={0,2}";
var quotedMatch = '"((?:[^"\\\\]|\\\\[\\s\\S])*)"';
var quotedParamMatcher = "(" + tokenMatch + ")\\s*=\\s*" + quotedMatch;
var paramMatcher = "(" + tokenMatch + ")\\s*=\\s*(" + tokenMatch + ")";
var schemeRE = new RegExp("^[,\\s]*(" + tokenMatch + ")");
var quotedParamRE = new RegExp("^[,\\s]*" + quotedParamMatcher + "[,\\s]*(.*)");
var unquotedParamRE = new RegExp("^[,\\s]*" + paramMatcher + "[,\\s]*(.*)");
var token68ParamRE = new RegExp("^(" + token68Match + ")(?:$|[,\\s])(.*)");
function parseWwwAuthenticateChallenges(response) {
  if (!looseInstanceOf(response, Response)) {
    throw CodedTypeError('"response" must be an instance of Response', ERR_INVALID_ARG_TYPE);
  }
  const header = response.headers.get("www-authenticate");
  if (header === null) {
    return void 0;
  }
  const challenges = [];
  let rest = header;
  while (rest) {
    let match = rest.match(schemeRE);
    const scheme = match?.["1"].toLowerCase();
    if (!scheme) {
      return void 0;
    }
    const afterScheme = rest.substring(match[0].length);
    if (afterScheme && !afterScheme.match(/^[\s,]/)) {
      return void 0;
    }
    const spaceMatch = afterScheme.match(/^\s+(.*)$/);
    const hasParameters = !!spaceMatch;
    rest = spaceMatch ? spaceMatch[1] : void 0;
    const parameters = {};
    let token68;
    if (hasParameters) {
      while (rest) {
        let key;
        let value;
        if (match = rest.match(quotedParamRE)) {
          ;
          [, key, value, rest] = match;
          if (value.includes("\\")) {
            value = value.replace(/\\([\s\S])/g, "$1");
          }
          parameters[key.toLowerCase()] = value;
          continue;
        }
        if (match = rest.match(unquotedParamRE)) {
          ;
          [, key, value, rest] = match;
          parameters[key.toLowerCase()] = value;
          continue;
        }
        if (match = rest.match(token68ParamRE)) {
          if (Object.keys(parameters).length) {
            break;
          }
          ;
          [, token68, rest] = match;
          break;
        }
        return void 0;
      }
    } else {
      rest = afterScheme || void 0;
    }
    const challenge = { scheme, parameters };
    if (token68) {
      challenge.token68 = token68;
    }
    challenges.push(challenge);
  }
  if (!challenges.length) {
    return void 0;
  }
  return challenges;
}
async function parseOAuthResponseErrorBody(response) {
  if (response.status > 399 && response.status < 500) {
    assertReadableResponse(response);
    assertApplicationJson(response);
    try {
      const json = await response.clone().json();
      if (isJsonObject(json) && typeof json.error === "string" && json.error.length) {
        return json;
      }
    } catch {
    }
  }
  return void 0;
}
async function checkOAuthBodyError(response, expected, label) {
  if (response.status !== expected) {
    checkAuthenticationChallenges(response);
    let err;
    if (err = await parseOAuthResponseErrorBody(response)) {
      await response.body?.cancel();
      throw new ResponseBodyError("server responded with an error in the response body", {
        cause: err,
        response
      });
    }
    throw OPE(`"response" is not a conform ${label} response (unexpected HTTP status code)`, RESPONSE_IS_NOT_CONFORM, response);
  }
}
function assertDPoP(option) {
  if (!branded.has(option)) {
    throw CodedTypeError('"options.DPoP" is not a valid DPoPHandle', ERR_INVALID_ARG_VALUE);
  }
}
var jwksMap;
var jwksRequests;
var jwksKeys;
function setJwksCache(as, jwks, uat, cache) {
  jwksMap ||= /* @__PURE__ */ new WeakMap();
  jwksMap.set(as, {
    jwks,
    uat,
    get age() {
      return epochTime() - this.uat;
    }
  });
  if (cache) {
    Object.assign(cache, { jwks: structuredClone(jwks), uat });
  }
}
function isFreshJwksCache(input) {
  if (typeof input !== "object" || input === null) {
    return false;
  }
  if (!("uat" in input) || typeof input.uat !== "number" || epochTime() - input.uat >= 300) {
    return false;
  }
  if (!("jwks" in input) || !isJsonObject(input.jwks) || !Array.isArray(input.jwks.keys) || !Array.prototype.every.call(input.jwks.keys, isJsonObject)) {
    return false;
  }
  return true;
}
function clearJwksCache(as, cache) {
  jwksMap?.delete(as);
  delete cache?.jwks;
  delete cache?.uat;
}
async function getPublicSigKeyFromIssuerJwksUri(as, options, header) {
  const { alg, kid } = header;
  checkSupportedJwsAlg(header);
  if (!jwksMap?.has(as) && isFreshJwksCache(options?.[jwksCache])) {
    setJwksCache(as, options?.[jwksCache].jwks, options?.[jwksCache].uat);
  }
  let jwks;
  let age;
  if (jwksMap?.has(as)) {
    ;
    ({ jwks, age } = jwksMap.get(as));
    if (age >= 300) {
      clearJwksCache(as, options?.[jwksCache]);
      return getPublicSigKeyFromIssuerJwksUri(as, options, header);
    }
  } else {
    const downloaded = await jwksRequest(as, options);
    jwks = downloaded.jwks;
    age = epochTime() - downloaded.uat;
    setJwksCache(as, jwks, downloaded.uat, options?.[jwksCache]);
  }
  let kty;
  switch (alg.slice(0, 2)) {
    case "RS":
    case "PS":
      kty = "RSA";
      break;
    case "ES":
      kty = "EC";
      break;
    case "Ed":
      kty = "OKP";
      break;
    case "ML":
      kty = "AKP";
      break;
    default:
      throw new UnsupportedOperationError("unsupported JWS algorithm", { cause: { alg } });
  }
  const candidates = jwks.keys.filter((jwk2) => {
    if (jwk2.kty !== kty) {
      return false;
    }
    if (kid !== void 0 && kid !== jwk2.kid) {
      return false;
    }
    if (jwk2.alg !== void 0 && alg !== jwk2.alg) {
      return false;
    }
    if (jwk2.use !== void 0 && jwk2.use !== "sig") {
      return false;
    }
    if (jwk2.key_ops?.includes("verify") === false) {
      return false;
    }
    switch (true) {
      case (alg === "ES256" && jwk2.crv !== "P-256"):
      case (alg === "ES384" && jwk2.crv !== "P-384"):
      case (alg === "ES512" && jwk2.crv !== "P-521"):
      case (alg === "Ed25519" && jwk2.crv !== "Ed25519"):
      case (alg === "EdDSA" && jwk2.crv !== "Ed25519"):
        return false;
    }
    return true;
  });
  const { 0: jwk, length } = candidates;
  if (!length) {
    if (age >= 60) {
      clearJwksCache(as, options?.[jwksCache]);
      return getPublicSigKeyFromIssuerJwksUri(as, options, header);
    }
    throw OPE("error when selecting a JWT verification key, no applicable keys found", KEY_SELECTION, { header, candidates, jwks_uri: new URL(as.jwks_uri) });
  }
  if (length !== 1) {
    throw OPE('error when selecting a JWT verification key, multiple applicable keys found, a "kid" JWT Header Parameter is required', KEY_SELECTION, { header, candidates, jwks_uri: new URL(as.jwks_uri) });
  }
  jwksKeys ||= /* @__PURE__ */ new WeakMap();
  let keys = jwksKeys.get(jwk);
  if (!keys) {
    keys = /* @__PURE__ */ new Map();
    jwksKeys.set(jwk, keys);
  }
  let key = keys.get(alg);
  if (!key) {
    key = importJwk(alg, jwk).catch((cause) => {
      keys.delete(alg);
      throw cause;
    });
    keys.set(alg, key);
  }
  return key;
}
var skipSubjectCheck = Symbol();
function getContentType(input) {
  return input.headers.get("content-type")?.split(";")[0];
}
async function authenticatedRequest(as, client, clientAuthentication, url, body, headers2, options) {
  await clientAuthentication(as, client, body, headers2);
  headers2.set("content-type", "application/x-www-form-urlencoded;charset=UTF-8");
  return (options?.[customFetch] || fetch)(url.href, {
    body,
    headers: Object.fromEntries(headers2.entries()),
    method: "POST",
    redirect: "manual",
    signal: signal(url, options?.signal)
  });
}
async function tokenEndpointRequest(as, client, clientAuthentication, grantType, parameters, options) {
  const url = resolveEndpoint(as, "token_endpoint", client.use_mtls_endpoint_aliases, options?.[allowInsecureRequests] !== true);
  parameters.set("grant_type", grantType);
  const headers2 = prepareHeaders(options?.headers);
  headers2.set("accept", "application/json");
  if (options?.DPoP !== void 0) {
    assertDPoP(options.DPoP);
    await options.DPoP.addProof(url, headers2, "POST");
  }
  const response = await authenticatedRequest(as, client, clientAuthentication, url, parameters, headers2, options);
  options?.DPoP?.cacheNonce(response, url);
  return response;
}
async function refreshTokenGrantRequest(as, client, clientAuthentication, refreshToken, options) {
  assertAs(as);
  assertClient(client);
  assertString(refreshToken, '"refreshToken"');
  const parameters = new URLSearchParams(options?.additionalParameters);
  parameters.set("refresh_token", refreshToken);
  return tokenEndpointRequest(as, client, clientAuthentication, "refresh_token", parameters, options);
}
var idTokenClaims = /* @__PURE__ */ new WeakMap();
var jwtRefs = /* @__PURE__ */ new WeakMap();
function getValidatedIdTokenClaims(ref) {
  if (!ref.id_token) {
    return void 0;
  }
  const claims = idTokenClaims.get(ref);
  if (!claims) {
    throw CodedTypeError('"ref" was already garbage collected or did not resolve from the proper sources', ERR_INVALID_ARG_VALUE);
  }
  return claims;
}
async function validateApplicationLevelSignature(as, ref, options) {
  assertAs(as);
  if (!jwtRefs.has(ref)) {
    throw CodedTypeError('"ref" does not contain a processed JWT Response to verify the signature of', ERR_INVALID_ARG_VALUE);
  }
  const { 0: protectedHeader, 1: payload, 2: encodedSignature } = jwtRefs.get(ref).split(".");
  const header = JSON.parse(buf(b64u(protectedHeader)));
  if (header.alg.startsWith("HS")) {
    throw new UnsupportedOperationError("unsupported JWS algorithm", { cause: { alg: header.alg } });
  }
  let key;
  key = await getPublicSigKeyFromIssuerJwksUri(as, options, header);
  await validateJwsSignature(protectedHeader, payload, key, b64u(encodedSignature));
}
async function processGenericAccessTokenResponse(as, client, response, additionalRequiredIdTokenClaims, decryptFn, recognizedTokenTypes) {
  assertAs(as);
  assertClient(client);
  if (!looseInstanceOf(response, Response)) {
    throw CodedTypeError('"response" must be an instance of Response', ERR_INVALID_ARG_TYPE);
  }
  await checkOAuthBodyError(response, 200, "Token Endpoint");
  assertReadableResponse(response);
  const json = await getResponseJsonBody(response);
  assertString(json.access_token, '"response" body "access_token" property', INVALID_RESPONSE, {
    body: json
  });
  assertString(json.token_type, '"response" body "token_type" property', INVALID_RESPONSE, {
    body: json
  });
  json.token_type = json.token_type.toLowerCase();
  if (json.expires_in !== void 0) {
    let expiresIn = typeof json.expires_in !== "number" ? parseFloat(json.expires_in) : json.expires_in;
    assertNumber(expiresIn, true, '"response" body "expires_in" property', INVALID_RESPONSE, {
      body: json
    });
    json.expires_in = expiresIn;
  }
  if (json.refresh_token !== void 0) {
    assertString(json.refresh_token, '"response" body "refresh_token" property', INVALID_RESPONSE, {
      body: json
    });
  }
  if (json.scope !== void 0 && typeof json.scope !== "string") {
    throw OPE('"response" body "scope" property must be a string', INVALID_RESPONSE, { body: json });
  }
  if (json.id_token !== void 0) {
    assertString(json.id_token, '"response" body "id_token" property', INVALID_RESPONSE, {
      body: json
    });
    const requiredClaims = [];
    if (client.require_auth_time === true) {
      requiredClaims.push("auth_time");
    }
    if (client.default_max_age !== void 0) {
      assertNumber(client.default_max_age, true, '"client.default_max_age"');
      requiredClaims.push("auth_time");
    }
    if (additionalRequiredIdTokenClaims?.length) {
      requiredClaims.push(...additionalRequiredIdTokenClaims);
    }
    const { claims, jwt } = await validateIdTokenClaims(as, client, json.id_token, requiredClaims, decryptFn);
    validateIdTokenAuthorizedParty(client, claims);
    validateIdTokenAuthTimeClaim(claims);
    jwtRefs.set(response, jwt);
    idTokenClaims.set(json, claims);
  }
  if (recognizedTokenTypes?.[json.token_type] !== void 0) {
    recognizedTokenTypes[json.token_type](response, json);
  } else if (json.token_type !== "dpop" && json.token_type !== "bearer") {
    throw new UnsupportedOperationError("unsupported `token_type` value", { cause: { body: json } });
  }
  return json;
}
function checkAuthenticationChallenges(response) {
  let challenges;
  if (challenges = parseWwwAuthenticateChallenges(response)) {
    throw new WWWAuthenticateChallengeError("server responded with a challenge in the WWW-Authenticate HTTP Header", { cause: challenges, response });
  }
}
async function processRefreshTokenResponse(as, client, response, options) {
  return processGenericAccessTokenResponse(as, client, response, void 0, options?.[jweDecrypt], options?.recognizedTokenTypes);
}
function validateAudience(expected, result) {
  if (Array.isArray(result.claims.aud)) {
    if (!result.claims.aud.includes(expected)) {
      throw OPE('unexpected JWT "aud" (audience) claim value', JWT_CLAIM_COMPARISON, {
        expected,
        claims: result.claims,
        claim: "aud"
      });
    }
  } else if (result.claims.aud !== expected) {
    throw OPE('unexpected JWT "aud" (audience) claim value', JWT_CLAIM_COMPARISON, {
      expected,
      claims: result.claims,
      claim: "aud"
    });
  }
  return result;
}
function validateIssuer(as, result) {
  const expected = as[_expectedIssuer]?.(result) ?? as.issuer;
  if (result.claims.iss !== expected) {
    throw OPE('unexpected JWT "iss" (issuer) claim value', JWT_CLAIM_COMPARISON, {
      expected,
      claims: result.claims,
      claim: "iss"
    });
  }
  return result;
}
var branded = /* @__PURE__ */ new WeakSet();
function brand(searchParams) {
  branded.add(searchParams);
  return searchParams;
}
var nopkce = Symbol();
async function authorizationCodeGrantRequest(as, client, clientAuthentication, callbackParameters, redirectUri, codeVerifier, options) {
  assertAs(as);
  assertClient(client);
  if (!branded.has(callbackParameters)) {
    throw CodedTypeError('"callbackParameters" must be an instance of URLSearchParams obtained from "validateAuthResponse()", or "validateJwtAuthResponse()', ERR_INVALID_ARG_VALUE);
  }
  assertString(redirectUri, '"redirectUri"');
  const code = getURLSearchParameter(callbackParameters, "code");
  if (!code) {
    throw OPE('no authorization code in "callbackParameters"', INVALID_RESPONSE);
  }
  const parameters = new URLSearchParams(options?.additionalParameters);
  parameters.set("redirect_uri", redirectUri);
  parameters.set("code", code);
  if (codeVerifier !== nopkce) {
    assertString(codeVerifier, '"codeVerifier"');
    parameters.set("code_verifier", codeVerifier);
  }
  return tokenEndpointRequest(as, client, clientAuthentication, "authorization_code", parameters, options);
}
var jwtClaimNames = {
  aud: "audience",
  c_hash: "code hash",
  client_id: "client id",
  exp: "expiration time",
  iat: "issued at",
  iss: "issuer",
  jti: "jwt id",
  nonce: "nonce",
  s_hash: "state hash",
  sub: "subject",
  ath: "access token hash",
  htm: "http method",
  htu: "http uri",
  cnf: "confirmation",
  auth_time: "authentication time"
};
function validatePresence(required, result) {
  for (const claim of required) {
    if (result.claims[claim] === void 0) {
      throw OPE(`JWT "${claim}" (${jwtClaimNames[claim]}) claim missing`, INVALID_RESPONSE, {
        claims: result.claims
      });
    }
  }
  return result;
}
function validateStringClaim(claim, result) {
  if (typeof result.claims[claim] !== "string") {
    throw OPE(`unexpected JWT "${claim}" (${jwtClaimNames[claim]}) claim type`, INVALID_RESPONSE, {
      claims: result.claims
    });
  }
  return result;
}
function validateIdTokenClaims(as, client, idToken, requiredClaims, decryptFn) {
  return validateJwt(idToken, checkSigningAlgorithm.bind(void 0, client.id_token_signed_response_alg, as.id_token_signing_alg_values_supported, "RS256"), getClockSkew(client), getClockTolerance(client), decryptFn).then(validatePresence.bind(void 0, ["aud", "exp", "iat", "iss", "sub", ...requiredClaims])).then(validateIssuer.bind(void 0, as)).then(validateAudience.bind(void 0, client.client_id)).then(validateStringClaim.bind(void 0, "sub"));
}
function resolveIdTokenMaxAge(client, maxAge) {
  if (maxAge === skipAuthTimeCheck) {
    return maxAge;
  }
  const fromClient = maxAge === void 0;
  if (fromClient) {
    maxAge = client.default_max_age;
  }
  if (maxAge === void 0) {
    return skipAuthTimeCheck;
  }
  assertNumber(maxAge, true, fromClient ? '"client.default_max_age"' : '"maxAge" argument');
  return maxAge;
}
function validateIdTokenAuthTimeClaim(claims) {
  if (claims.auth_time !== void 0) {
    assertNumber(claims.auth_time, true, 'ID Token "auth_time" (authentication time)', INVALID_RESPONSE, { claims });
  }
}
function validateIdTokenAuthTime(client, claims, maxAge) {
  if (maxAge === skipAuthTimeCheck) {
    return;
  }
  const now = epochTime() + getClockSkew(client);
  const tolerance = getClockTolerance(client);
  if (claims.auth_time + maxAge < now - tolerance) {
    throw OPE("too much time has elapsed since the last End-User authentication", JWT_TIMESTAMP_CHECK, { claims, now, tolerance, claim: "auth_time" });
  }
}
function validateIdTokenNonce(claims, expectedNonce) {
  const expected = expectedNonce === expectNoNonce ? void 0 : expectedNonce;
  if (claims.nonce !== expected) {
    throw OPE('unexpected ID Token "nonce" claim value', JWT_CLAIM_COMPARISON, {
      expected,
      claims,
      claim: "nonce"
    });
  }
}
function validateIdTokenAuthorizedParty(client, claims) {
  if (Array.isArray(claims.aud) && claims.aud.length !== 1) {
    if (claims.azp === void 0) {
      throw OPE('ID Token "aud" (audience) claim includes additional untrusted audiences', JWT_CLAIM_COMPARISON, { claims, claim: "aud" });
    }
    if (claims.azp !== client.client_id) {
      throw OPE('unexpected ID Token "azp" (authorized party) claim value', JWT_CLAIM_COMPARISON, {
        expected: client.client_id,
        claims,
        claim: "azp"
      });
    }
  }
}
var expectNoNonce = Symbol();
var skipAuthTimeCheck = Symbol();
async function processAuthorizationCodeResponse(as, client, response, options) {
  if (typeof options?.expectedNonce === "string" || typeof options?.maxAge === "number" || options?.requireIdToken) {
    return processAuthorizationCodeOpenIDResponse(as, client, response, options.expectedNonce, options.maxAge, options[jweDecrypt], options.recognizedTokenTypes);
  }
  return processAuthorizationCodeOAuth2Response(as, client, response, options?.maxAge, options?.[jweDecrypt], options?.recognizedTokenTypes);
}
async function processAuthorizationCodeOpenIDResponse(as, client, response, expectedNonce, maxAge, decryptFn, recognizedTokenTypes) {
  const additionalRequiredClaims = [];
  switch (expectedNonce) {
    case void 0:
      expectedNonce = expectNoNonce;
      break;
    case expectNoNonce:
      break;
    default:
      assertString(expectedNonce, '"expectedNonce" argument');
      additionalRequiredClaims.push("nonce");
  }
  maxAge = resolveIdTokenMaxAge(client, maxAge);
  if (maxAge !== skipAuthTimeCheck) {
    additionalRequiredClaims.push("auth_time");
  }
  const result = await processGenericAccessTokenResponse(as, client, response, additionalRequiredClaims, decryptFn, recognizedTokenTypes);
  assertString(result.id_token, '"response" body "id_token" property', INVALID_RESPONSE, {
    body: result
  });
  const claims = getValidatedIdTokenClaims(result);
  validateIdTokenAuthTime(client, claims, maxAge);
  validateIdTokenNonce(claims, expectedNonce);
  return result;
}
async function processAuthorizationCodeOAuth2Response(as, client, response, maxAge, decryptFn, recognizedTokenTypes) {
  const result = await processGenericAccessTokenResponse(as, client, response, void 0, decryptFn, recognizedTokenTypes);
  const claims = getValidatedIdTokenClaims(result);
  if (claims) {
    validateIdTokenAuthTime(client, claims, resolveIdTokenMaxAge(client, maxAge));
    validateIdTokenNonce(claims, expectNoNonce);
  }
  return result;
}
var WWW_AUTHENTICATE_CHALLENGE = "OAUTH_WWW_AUTHENTICATE_CHALLENGE";
var RESPONSE_BODY_ERROR = "OAUTH_RESPONSE_BODY_ERROR";
var UNSUPPORTED_OPERATION = "OAUTH_UNSUPPORTED_OPERATION";
var AUTHORIZATION_RESPONSE_ERROR = "OAUTH_AUTHORIZATION_RESPONSE_ERROR";
var PARSE_ERROR = "OAUTH_PARSE_ERROR";
var INVALID_RESPONSE = "OAUTH_INVALID_RESPONSE";
var RESPONSE_IS_NOT_JSON = "OAUTH_RESPONSE_IS_NOT_JSON";
var RESPONSE_IS_NOT_CONFORM = "OAUTH_RESPONSE_IS_NOT_CONFORM";
var HTTP_REQUEST_FORBIDDEN = "OAUTH_HTTP_REQUEST_FORBIDDEN";
var REQUEST_PROTOCOL_FORBIDDEN = "OAUTH_REQUEST_PROTOCOL_FORBIDDEN";
var JWT_TIMESTAMP_CHECK = "OAUTH_JWT_TIMESTAMP_CHECK_FAILED";
var JWT_CLAIM_COMPARISON = "OAUTH_JWT_CLAIM_COMPARISON_FAILED";
var JSON_ATTRIBUTE_COMPARISON = "OAUTH_JSON_ATTRIBUTE_COMPARISON_FAILED";
var KEY_SELECTION = "OAUTH_KEY_SELECTION_FAILED";
var MISSING_SERVER_METADATA = "OAUTH_MISSING_SERVER_METADATA";
var INVALID_SERVER_METADATA = "OAUTH_INVALID_SERVER_METADATA";
function assertReadableResponse(response) {
  if (response.bodyUsed) {
    throw CodedTypeError('"response" body has been used already', ERR_INVALID_ARG_VALUE);
  }
}
async function jwksRequest(as, options) {
  assertAs(as);
  const url = resolveEndpoint(as, "jwks_uri", false, options?.[allowInsecureRequests] !== true);
  const headers2 = prepareHeaders(options?.headers);
  headers2.set("accept", "application/json");
  headers2.append("accept", "application/jwk-set+json");
  const requestHeaders = Object.fromEntries(headers2.entries());
  const headersKey = JSON.stringify(requestHeaders);
  const fetcher = options?.[customFetch] || fetch;
  const requestSignal = signal(url, options?.signal);
  jwksRequests ||= /* @__PURE__ */ new WeakMap();
  const requests = jwksRequests.get(as) ?? /* @__PURE__ */ new Set();
  for (const pending2 of requests) {
    if (pending2.url === url.href && pending2.headers === headersKey && pending2.fetch === fetcher && pending2.signal === requestSignal) {
      return pending2.promise;
    }
  }
  const pending = {
    url: url.href,
    headers: headersKey,
    fetch: fetcher,
    signal: requestSignal,
    promise: Promise.resolve().then(() => fetcher(url.href, {
      body: void 0,
      headers: requestHeaders,
      method: "GET",
      redirect: "manual",
      signal: requestSignal
    })).then(processJwksResponse).then((jwks) => {
      const uat = epochTime();
      setJwksCache(as, jwks, uat);
      return { jwks, uat };
    }).finally(() => {
      requests.delete(pending);
      if (!requests.size) {
        jwksRequests.delete(as);
      }
    })
  };
  requests.add(pending);
  jwksRequests.set(as, requests);
  return pending.promise;
}
async function processJwksResponse(response) {
  if (!looseInstanceOf(response, Response)) {
    throw CodedTypeError('"response" must be an instance of Response', ERR_INVALID_ARG_TYPE);
  }
  if (response.status !== 200) {
    throw OPE('"response" is not a conform JSON Web Key Set response (unexpected HTTP status code)', RESPONSE_IS_NOT_CONFORM, response);
  }
  assertReadableResponse(response);
  const json = await getResponseJsonBody(response, (response2) => assertContentTypes(response2, "application/json", "application/jwk-set+json"));
  if (!Array.isArray(json.keys)) {
    throw OPE('"response" body "keys" property must be an array', INVALID_RESPONSE, { body: json });
  }
  if (!Array.prototype.every.call(json.keys, isJsonObject)) {
    throw OPE('"response" body "keys" property members must be JWK formatted objects', INVALID_RESPONSE, { body: json });
  }
  return json;
}
function supported(alg) {
  switch (alg) {
    case "PS256":
    case "ES256":
    case "RS256":
    case "PS384":
    case "ES384":
    case "RS384":
    case "PS512":
    case "ES512":
    case "RS512":
    case "Ed25519":
    case "EdDSA":
    case "ML-DSA-44":
    case "ML-DSA-65":
    case "ML-DSA-87":
      return true;
    default:
      return false;
  }
}
function checkSupportedJwsAlg(header) {
  if (!supported(header.alg)) {
    throw new UnsupportedOperationError('unsupported JWS "alg" identifier', {
      cause: { alg: header.alg }
    });
  }
}
function checkRsaKeyAlgorithm(key) {
  const { algorithm } = key;
  if (typeof algorithm.modulusLength !== "number" || algorithm.modulusLength < 2048) {
    throw new UnsupportedOperationError(`unsupported ${algorithm.name} modulusLength`, {
      cause: key
    });
  }
}
function ecdsaHashName(key) {
  const { algorithm } = key;
  switch (algorithm.namedCurve) {
    case "P-256":
      return "SHA-256";
    case "P-384":
      return "SHA-384";
    case "P-521":
      return "SHA-512";
    default:
      throw new UnsupportedOperationError("unsupported ECDSA namedCurve", { cause: key });
  }
}
function keyToSubtle(key) {
  switch (key.algorithm.name) {
    case "ECDSA":
      return {
        name: key.algorithm.name,
        hash: ecdsaHashName(key)
      };
    case "RSA-PSS": {
      checkRsaKeyAlgorithm(key);
      switch (key.algorithm.hash.name) {
        case "SHA-256":
        case "SHA-384":
        case "SHA-512":
          return {
            name: key.algorithm.name,
            saltLength: parseInt(key.algorithm.hash.name.slice(-3), 10) >> 3
          };
        default:
          throw new UnsupportedOperationError("unsupported RSA-PSS hash name", { cause: key });
      }
    }
    case "RSASSA-PKCS1-v1_5":
      checkRsaKeyAlgorithm(key);
      return key.algorithm.name;
    case "ML-DSA-44":
    case "ML-DSA-65":
    case "ML-DSA-87":
    case "Ed25519":
      return key.algorithm.name;
  }
  throw new UnsupportedOperationError("unsupported CryptoKey algorithm name", { cause: key });
}
async function validateJwsSignature(protectedHeader, payload, key, signature) {
  const data = buf(`${protectedHeader}.${payload}`);
  const algorithm = keyToSubtle(key);
  const verified = await crypto.subtle.verify(algorithm, key, signature, data);
  if (!verified) {
    throw OPE("JWT signature verification failed", INVALID_RESPONSE, {
      key,
      data,
      signature,
      algorithm
    });
  }
}
async function validateJwt(jws, checkAlg, clockSkew2, clockTolerance2, decryptJwt) {
  let { 0: protectedHeader, 1: payload, length } = jws.split(".");
  if (length === 5) {
    if (decryptJwt !== void 0) {
      jws = await decryptJwt(jws);
      ({ 0: protectedHeader, 1: payload, length } = jws.split("."));
    } else {
      throw new UnsupportedOperationError("JWE decryption is not configured", { cause: jws });
    }
  }
  if (length !== 3) {
    throw OPE("Invalid JWT", INVALID_RESPONSE, jws);
  }
  let header;
  try {
    header = JSON.parse(buf(b64u(protectedHeader)));
  } catch (cause) {
    throw OPE("failed to parse JWT Header body as base64url encoded JSON", PARSE_ERROR, cause);
  }
  if (!isJsonObject(header)) {
    throw OPE("JWT Header must be a top level object", INVALID_RESPONSE, jws);
  }
  checkAlg(header);
  if (header.crit !== void 0) {
    throw new UnsupportedOperationError('no JWT "crit" header parameter extensions are supported', {
      cause: { header }
    });
  }
  let claims;
  try {
    claims = JSON.parse(buf(b64u(payload)));
  } catch (cause) {
    throw OPE("failed to parse JWT Payload body as base64url encoded JSON", PARSE_ERROR, cause);
  }
  if (!isJsonObject(claims)) {
    throw OPE("JWT Payload must be a top level object", INVALID_RESPONSE, jws);
  }
  const now = epochTime() + clockSkew2;
  if (claims.exp !== void 0) {
    if (typeof claims.exp !== "number") {
      throw OPE('unexpected JWT "exp" (expiration time) claim type', INVALID_RESPONSE, { claims });
    }
    if (claims.exp <= now - clockTolerance2) {
      throw OPE('unexpected JWT "exp" (expiration time) claim value, expiration is past current timestamp', JWT_TIMESTAMP_CHECK, { claims, now, tolerance: clockTolerance2, claim: "exp" });
    }
  }
  if (claims.iat !== void 0) {
    if (typeof claims.iat !== "number") {
      throw OPE('unexpected JWT "iat" (issued at) claim type', INVALID_RESPONSE, { claims });
    }
  }
  if (claims.iss !== void 0) {
    if (typeof claims.iss !== "string") {
      throw OPE('unexpected JWT "iss" (issuer) claim type', INVALID_RESPONSE, { claims });
    }
  }
  if (claims.nbf !== void 0) {
    if (typeof claims.nbf !== "number") {
      throw OPE('unexpected JWT "nbf" (not before) claim type', INVALID_RESPONSE, { claims });
    }
    if (claims.nbf > now + clockTolerance2) {
      throw OPE('unexpected JWT "nbf" (not before) claim value', JWT_TIMESTAMP_CHECK, {
        claims,
        now,
        tolerance: clockTolerance2,
        claim: "nbf"
      });
    }
  }
  if (claims.aud !== void 0) {
    if (typeof claims.aud !== "string" && !Array.isArray(claims.aud)) {
      throw OPE('unexpected JWT "aud" (audience) claim type', INVALID_RESPONSE, { claims });
    }
  }
  return { header, claims, jwt: jws };
}
async function consumeStream(request) {
  if (request.bodyUsed) {
    throw CodedTypeError("form_post Request instances must contain a readable body", ERR_INVALID_ARG_VALUE, { cause: request });
  }
  return request.text();
}
async function formPostResponse(request) {
  if (request.method !== "POST") {
    throw CodedTypeError("form_post responses are expected to use the POST method", ERR_INVALID_ARG_VALUE, { cause: request });
  }
  if (getContentType(request) !== "application/x-www-form-urlencoded") {
    throw CodedTypeError("form_post responses are expected to use the application/x-www-form-urlencoded content-type", ERR_INVALID_ARG_VALUE, { cause: request });
  }
  return consumeStream(request);
}
function checkSigningAlgorithm(client, issuer, fallback, header) {
  if (client !== void 0) {
    if (typeof client === "string" ? header.alg !== client : !client.includes(header.alg)) {
      throw OPE('unexpected JWT "alg" header parameter', INVALID_RESPONSE, {
        header,
        expected: client,
        reason: "client configuration"
      });
    }
    return;
  }
  if (Array.isArray(issuer)) {
    if (!issuer.includes(header.alg)) {
      throw OPE('unexpected JWT "alg" header parameter', INVALID_RESPONSE, {
        header,
        expected: issuer,
        reason: "authorization server metadata"
      });
    }
    return;
  }
  if (fallback !== void 0) {
    if (typeof fallback === "string" ? header.alg !== fallback : typeof fallback === "function" ? !fallback(header.alg) : !fallback.includes(header.alg)) {
      throw OPE('unexpected JWT "alg" header parameter', INVALID_RESPONSE, {
        header,
        expected: fallback,
        reason: "default value"
      });
    }
    return;
  }
  throw OPE('missing client or server configuration to verify used JWT "alg" header parameter', void 0, { client, issuer, fallback });
}
function getURLSearchParameter(parameters, name) {
  const { 0: value, length } = parameters.getAll(name);
  if (length > 1) {
    throw OPE(`"${name}" parameter must be provided only once`, INVALID_RESPONSE);
  }
  return value;
}
var skipStateCheck = Symbol();
var expectNoState = Symbol();
function validateAuthResponse(as, client, parameters, expectedState) {
  assertAs(as);
  assertClient(client);
  if (parameters instanceof URL) {
    parameters = parameters.searchParams;
  }
  if (!(parameters instanceof URLSearchParams)) {
    throw CodedTypeError('"parameters" must be an instance of URLSearchParams, or URL', ERR_INVALID_ARG_TYPE);
  }
  if (getURLSearchParameter(parameters, "response")) {
    throw OPE('"parameters" contains a JARM response, use validateJwtAuthResponse() instead of validateAuthResponse()', INVALID_RESPONSE, { parameters });
  }
  const iss = getURLSearchParameter(parameters, "iss");
  const state = getURLSearchParameter(parameters, "state");
  if (!iss && as.authorization_response_iss_parameter_supported) {
    throw OPE('response parameter "iss" (issuer) missing', INVALID_RESPONSE, { parameters });
  }
  if (iss && iss !== as.issuer) {
    throw OPE('unexpected "iss" (issuer) response parameter value', INVALID_RESPONSE, {
      expected: as.issuer,
      parameters
    });
  }
  switch (expectedState) {
    case void 0:
    case expectNoState:
      if (state !== void 0) {
        throw OPE('unexpected "state" response parameter encountered', INVALID_RESPONSE, {
          expected: void 0,
          parameters
        });
      }
      break;
    case skipStateCheck:
      break;
    default:
      assertString(expectedState, '"expectedState" argument');
      if (state !== expectedState) {
        throw OPE(state === void 0 ? 'response parameter "state" missing' : 'unexpected "state" response parameter value', INVALID_RESPONSE, { expected: expectedState, parameters });
      }
  }
  const error = getURLSearchParameter(parameters, "error");
  if (error) {
    throw new AuthorizationResponseError("authorization response from the server is an error", {
      cause: parameters
    });
  }
  const id_token = getURLSearchParameter(parameters, "id_token");
  const token = getURLSearchParameter(parameters, "token");
  if (id_token !== void 0 || token !== void 0) {
    throw new UnsupportedOperationError("implicit and hybrid flows are not supported");
  }
  return brand(new URLSearchParams(parameters));
}
function algToSubtle(alg) {
  switch (alg) {
    case "PS256":
    case "PS384":
    case "PS512":
      return { name: "RSA-PSS", hash: `SHA-${alg.slice(-3)}` };
    case "RS256":
    case "RS384":
    case "RS512":
      return { name: "RSASSA-PKCS1-v1_5", hash: `SHA-${alg.slice(-3)}` };
    case "ES256":
    case "ES384":
      return { name: "ECDSA", namedCurve: `P-${alg.slice(-3)}` };
    case "ES512":
      return { name: "ECDSA", namedCurve: "P-521" };
    case "EdDSA":
      return "Ed25519";
    case "Ed25519":
    case "ML-DSA-44":
    case "ML-DSA-65":
    case "ML-DSA-87":
      return alg;
    default:
      throw new UnsupportedOperationError("unsupported JWS algorithm", { cause: { alg } });
  }
}
async function importJwk(alg, jwk) {
  const { ext, key_ops, use, ...key } = jwk;
  return crypto.subtle.importKey("jwk", key, algToSubtle(alg), true, ["verify"]);
}
async function getResponseJsonBody(response, check = assertApplicationJson) {
  let json;
  try {
    json = await response.json();
  } catch (cause) {
    check(response);
    throw OPE('failed to parse "response" body as JSON', PARSE_ERROR, cause);
  }
  if (!isJsonObject(json)) {
    throw OPE('"response" body must be a top level object', INVALID_RESPONSE, { body: json });
  }
  return json;
}
var _nodiscoverycheck = Symbol();
var _expectedIssuer = Symbol();

// ../登入框架协议/node_modules/openid-client/build/index.js
var headers;
var USER_AGENT2;
if (typeof navigator === "undefined" || !navigator.userAgent?.startsWith?.("Mozilla/5.0 ")) {
  const NAME = "openid-client";
  const VERSION = "v6.8.1";
  USER_AGENT2 = `${NAME}/${VERSION}`;
  headers = { "user-agent": USER_AGENT2 };
}
var int = (config) => {
  return props.get(config);
};
var props;
var tbi;
function ClientSecretPost2(clientSecret) {
  if (clientSecret !== void 0) {
    return ClientSecretPost(clientSecret);
  }
  tbi ||= /* @__PURE__ */ new WeakMap();
  return (as, client, body, headers2) => {
    let auth;
    if (!(auth = tbi.get(client))) {
      assertString2(client.client_secret, '"metadata.client_secret"');
      auth = ClientSecretPost(client.client_secret);
      tbi.set(client, auth);
    }
    return auth(as, client, body, headers2);
  };
}
function assertString2(input, it) {
  if (typeof input !== "string") {
    throw CodedTypeError2(`${it} must be a string`, ERR_INVALID_ARG_TYPE2);
  }
  if (input.length === 0) {
    throw CodedTypeError2(`${it} must not be empty`, ERR_INVALID_ARG_VALUE2);
  }
}
function None2() {
  return None();
}
var customFetch2 = customFetch;
var ERR_INVALID_ARG_VALUE2 = "ERR_INVALID_ARG_VALUE";
var ERR_INVALID_ARG_TYPE2 = "ERR_INVALID_ARG_TYPE";
function CodedTypeError2(message, code, cause) {
  const err = new TypeError(message, { cause });
  Object.assign(err, { code });
  return err;
}
function calculatePKCECodeChallenge2(codeVerifier) {
  return calculatePKCECodeChallenge(codeVerifier);
}
function randomPKCECodeVerifier() {
  return generateRandomCodeVerifier();
}
function randomNonce() {
  return generateRandomNonce();
}
function randomState() {
  return generateRandomState();
}
var ClientError = class extends Error {
  code;
  constructor(message, options) {
    super(message, options);
    this.name = this.constructor.name;
    this.code = options?.code;
    Error.captureStackTrace?.(this, this.constructor);
  }
};
var decoder2 = new TextDecoder();
function e(msg, cause, code) {
  return new ClientError(msg, { cause, code });
}
function errorHandler(err) {
  if (err instanceof TypeError || err instanceof ClientError || err instanceof ResponseBodyError || err instanceof AuthorizationResponseError || err instanceof WWWAuthenticateChallengeError) {
    throw err;
  }
  if (err instanceof OperationProcessingError) {
    switch (err.code) {
      case HTTP_REQUEST_FORBIDDEN:
        throw e("only requests to HTTPS are allowed", err, err.code);
      case REQUEST_PROTOCOL_FORBIDDEN:
        throw e("only requests to HTTP or HTTPS are allowed", err, err.code);
      case RESPONSE_IS_NOT_CONFORM:
        throw e("unexpected HTTP response status code", err.cause, err.code);
      case RESPONSE_IS_NOT_JSON:
        throw e("unexpected response content-type", err.cause, err.code);
      case PARSE_ERROR:
        throw e("parsing error occured", err, err.code);
      case INVALID_RESPONSE:
        throw e("invalid response encountered", err, err.code);
      case JWT_CLAIM_COMPARISON:
        throw e("unexpected JWT claim value encountered", err, err.code);
      case JSON_ATTRIBUTE_COMPARISON:
        throw e("unexpected JSON attribute value encountered", err, err.code);
      case JWT_TIMESTAMP_CHECK:
        throw e("JWT timestamp claim value failed validation", err, err.code);
      default:
        throw e(err.message, err, err.code);
    }
  }
  if (err instanceof UnsupportedOperationError) {
    throw e("unsupported operation", err, err.code);
  }
  if (err instanceof DOMException) {
    switch (err.name) {
      case "OperationError":
        throw e("runtime operation error", err, UNSUPPORTED_OPERATION);
      case "NotSupportedError":
        throw e("runtime unsupported operation", err, UNSUPPORTED_OPERATION);
      case "TimeoutError":
        throw e("operation timed out", err, "OAUTH_TIMEOUT");
      case "AbortError":
        throw e("operation aborted", err, "OAUTH_ABORT");
    }
  }
  throw new ClientError("something went wrong", { cause: err });
}
function handleEntraId(server, as, options) {
  if (server.origin === "https://login.microsoftonline.com" && (!options?.algorithm || options.algorithm === "oidc")) {
    as[kEntraId] = true;
    return true;
  }
  return false;
}
function handleB2Clogin(server, options) {
  if (server.hostname.endsWith(".b2clogin.com") && (!options?.algorithm || options.algorithm === "oidc")) {
    return true;
  }
  return false;
}
async function discovery(server, clientId, metadata, clientAuthentication, options) {
  const as = await performDiscovery2(server, options);
  const instance = new Configuration(as, clientId, metadata, clientAuthentication);
  let internals = int(instance);
  if (options?.[customFetch2]) {
    internals.fetch = options[customFetch2];
  }
  if (options?.timeout) {
    internals.timeout = options.timeout;
  }
  if (options?.execute) {
    for (const extension of options.execute) {
      extension(instance);
    }
  }
  return instance;
}
async function performDiscovery2(server, options) {
  if (!(server instanceof URL)) {
    throw CodedTypeError2('"server" must be an instance of URL', ERR_INVALID_ARG_TYPE2);
  }
  const resolve = !server.href.includes("/.well-known/");
  const timeout = options?.timeout ?? 30;
  const signal3 = AbortSignal.timeout(timeout * 1e3);
  const as = await (resolve ? discoveryRequest(server, {
    algorithm: options?.algorithm,
    [customFetch]: options?.[customFetch2],
    [allowInsecureRequests]: options?.execute?.includes(allowInsecureRequests2),
    signal: signal3,
    headers: new Headers(headers)
  }) : (options?.[customFetch2] || fetch)((() => {
    checkProtocol(server, options?.execute?.includes(allowInsecureRequests2) ? false : true);
    return server.href;
  })(), {
    headers: Object.fromEntries(new Headers({ accept: "application/json", ...headers }).entries()),
    body: void 0,
    method: "GET",
    redirect: "manual",
    signal: signal3
  })).then((response) => processDiscoveryResponse(_nodiscoverycheck, response)).catch(errorHandler);
  if (resolve && new URL(as.issuer).href !== server.href) {
    handleEntraId(server, as, options) || handleB2Clogin(server, options) || (() => {
      throw new ClientError("discovered metadata issuer does not match the expected issuer", {
        code: JSON_ATTRIBUTE_COMPARISON,
        cause: {
          expected: server.href,
          body: as,
          attribute: "issuer"
        }
      });
    })();
  }
  return as;
}
function getServerHelpers(metadata) {
  return {
    supportsPKCE: {
      __proto__: null,
      value(method = "S256") {
        return metadata.code_challenge_methods_supported?.includes(method) === true;
      }
    }
  };
}
function addServerHelpers(metadata) {
  Object.defineProperties(metadata, getServerHelpers(metadata));
}
var kEntraId = Symbol();
var Configuration = class {
  constructor(server, clientId, metadata, clientAuthentication) {
    if (typeof clientId !== "string" || !clientId.length) {
      throw CodedTypeError2('"clientId" must be a non-empty string', ERR_INVALID_ARG_TYPE2);
    }
    if (typeof metadata === "string") {
      metadata = { client_secret: metadata };
    }
    if (metadata?.client_id !== void 0 && clientId !== metadata.client_id) {
      throw CodedTypeError2('"clientId" and "metadata.client_id" must be the same', ERR_INVALID_ARG_VALUE2);
    }
    const client = {
      ...structuredClone(metadata),
      client_id: clientId
    };
    client[clockSkew] = metadata?.[clockSkew] ?? 0;
    client[clockTolerance] = metadata?.[clockTolerance] ?? 30;
    let auth;
    if (clientAuthentication) {
      auth = clientAuthentication;
    } else {
      if (typeof client.client_secret === "string" && client.client_secret.length) {
        auth = ClientSecretPost2(client.client_secret);
      } else {
        auth = None2();
      }
    }
    let c = Object.freeze(client);
    const clone = structuredClone(server);
    if (kEntraId in server) {
      clone[_expectedIssuer] = ({ claims: { tid } }) => server.issuer.replace("{tenantid}", tid);
    }
    let as = Object.freeze(clone);
    props ||= /* @__PURE__ */ new WeakMap();
    props.set(this, {
      __proto__: null,
      as,
      c,
      auth,
      tlsOnly: true,
      jwksCache: {}
    });
  }
  serverMetadata() {
    const metadata = structuredClone(int(this).as);
    addServerHelpers(metadata);
    return metadata;
  }
  clientMetadata() {
    const metadata = structuredClone(int(this).c);
    return metadata;
  }
  get timeout() {
    return int(this).timeout;
  }
  set timeout(value) {
    int(this).timeout = value;
  }
  get [customFetch2]() {
    return int(this).fetch;
  }
  set [customFetch2](value) {
    int(this).fetch = value;
  }
};
Object.freeze(Configuration.prototype);
function getHelpers(response) {
  let exp = void 0;
  if (response.expires_in !== void 0) {
    const now = /* @__PURE__ */ new Date();
    now.setSeconds(now.getSeconds() + response.expires_in);
    exp = now.getTime();
  }
  return {
    expiresIn: {
      __proto__: null,
      value() {
        if (exp) {
          const now = Date.now();
          if (exp > now) {
            return Math.floor((exp - now) / 1e3);
          }
          return 0;
        }
        return void 0;
      }
    },
    claims: {
      __proto__: null,
      value() {
        try {
          return getValidatedIdTokenClaims(this);
        } catch {
          return void 0;
        }
      }
    }
  };
}
function addHelpers(response) {
  Object.defineProperties(response, getHelpers(response));
}
function allowInsecureRequests2(config) {
  int(config).tlsOnly = false;
}
function enableNonRepudiationChecks(config) {
  checkConfig(config);
  int(config).nonRepudiation = (response) => {
    const { as, fetch: fetch2, tlsOnly, timeout, jwksCache: jwksCache2 } = int(config);
    return validateApplicationLevelSignature(as, response, {
      [customFetch]: fetch2,
      [allowInsecureRequests]: !tlsOnly,
      headers: new Headers(headers),
      signal: signal2(timeout),
      [jwksCache]: jwksCache2
    }).catch(errorHandler);
  };
}
function stripParams(url) {
  url = new URL(url);
  url.search = "";
  url.hash = "";
  return url.href;
}
function webInstanceOf(input, toStringTag) {
  try {
    return Object.getPrototypeOf(input)[Symbol.toStringTag] === toStringTag;
  } catch {
    return false;
  }
}
async function authorizationCodeGrant(config, currentUrl, checks, tokenEndpointParameters, options) {
  checkConfig(config);
  if (options?.flag !== retry && !(currentUrl instanceof URL) && !webInstanceOf(currentUrl, "Request")) {
    throw CodedTypeError2('"currentUrl" must be an instance of URL, or Request', ERR_INVALID_ARG_TYPE2);
  }
  let authResponse;
  let redirectUri;
  const { as, c, auth, fetch: fetch2, tlsOnly, jarm, hybrid, nonRepudiation, timeout, decrypt, implicit } = int(config);
  if (options?.flag === retry) {
    authResponse = options.authResponse;
    redirectUri = options.redirectUri;
  } else {
    if (!(currentUrl instanceof URL)) {
      const request = currentUrl;
      currentUrl = new URL(currentUrl.url);
      switch (request.method) {
        case "GET":
          break;
        case "POST":
          const params = new URLSearchParams(await formPostResponse(request));
          if (hybrid) {
            currentUrl.hash = params.toString();
          } else {
            for (const [k, v] of params.entries()) {
              currentUrl.searchParams.append(k, v);
            }
          }
          break;
        default:
          throw CodedTypeError2("unexpected Request HTTP method", ERR_INVALID_ARG_VALUE2);
      }
    }
    redirectUri = stripParams(currentUrl);
    switch (true) {
      case !!jarm:
        authResponse = await jarm(currentUrl, checks?.expectedState);
        break;
      case !!hybrid:
        authResponse = await hybrid(currentUrl, checks?.expectedNonce, checks?.expectedState, checks?.maxAge);
        break;
      case !!implicit:
        throw new TypeError("authorizationCodeGrant() cannot be used by response_type=id_token clients");
      default:
        try {
          authResponse = validateAuthResponse(as, c, currentUrl.searchParams, checks?.expectedState);
        } catch (err) {
          errorHandler(err);
        }
    }
  }
  const response = await authorizationCodeGrantRequest(as, c, auth, authResponse, redirectUri, checks?.pkceCodeVerifier || nopkce, {
    additionalParameters: tokenEndpointParameters,
    [customFetch]: fetch2,
    [allowInsecureRequests]: !tlsOnly,
    DPoP: options?.DPoP,
    headers: new Headers(headers),
    signal: signal2(timeout)
  }).catch(errorHandler);
  if (typeof checks?.expectedNonce === "string" || typeof checks?.maxAge === "number") {
    checks.idTokenExpected = true;
  }
  const p = processAuthorizationCodeResponse(as, c, response, {
    expectedNonce: checks?.expectedNonce,
    maxAge: checks?.maxAge,
    requireIdToken: checks?.idTokenExpected,
    [jweDecrypt]: decrypt
  });
  let result;
  try {
    result = await p;
  } catch (err) {
    if (retryable(err, options)) {
      return authorizationCodeGrant(config, void 0, checks, tokenEndpointParameters, {
        ...options,
        flag: retry,
        authResponse,
        redirectUri
      });
    }
    errorHandler(err);
  }
  result.id_token && await nonRepudiation?.(response);
  addHelpers(result);
  return result;
}
async function refreshTokenGrant(config, refreshToken, parameters, options) {
  checkConfig(config);
  parameters = new URLSearchParams(parameters);
  const { as, c, auth, fetch: fetch2, tlsOnly, nonRepudiation, timeout, decrypt } = int(config);
  const response = await refreshTokenGrantRequest(as, c, auth, refreshToken, {
    [customFetch]: fetch2,
    [allowInsecureRequests]: !tlsOnly,
    additionalParameters: parameters,
    DPoP: options?.DPoP,
    headers: new Headers(headers),
    signal: signal2(timeout)
  }).catch(errorHandler);
  const p = processRefreshTokenResponse(as, c, response, {
    [jweDecrypt]: decrypt
  });
  let result;
  try {
    result = await p;
  } catch (err) {
    if (retryable(err, options)) {
      return refreshTokenGrant(config, refreshToken, parameters, {
        ...options,
        flag: retry
      });
    }
    errorHandler(err);
  }
  result.id_token && await nonRepudiation?.(response);
  addHelpers(result);
  return result;
}
function buildAuthorizationUrl(config, parameters) {
  checkConfig(config);
  const { as, c, tlsOnly, hybrid, jarm, implicit } = int(config);
  const authorizationEndpoint = resolveEndpoint(as, "authorization_endpoint", false, tlsOnly);
  parameters = new URLSearchParams(parameters);
  if (!parameters.has("client_id")) {
    parameters.set("client_id", c.client_id);
  }
  if (!parameters.has("request_uri") && !parameters.has("request")) {
    if (!parameters.has("response_type")) {
      parameters.set("response_type", hybrid ? "code id_token" : implicit ? "id_token" : "code");
    }
    if (implicit && !parameters.has("nonce")) {
      throw CodedTypeError2("response_type=id_token clients must provide a nonce parameter in their authorization request parameters", ERR_INVALID_ARG_VALUE2);
    }
    if (jarm) {
      parameters.set("response_mode", "jwt");
    }
  }
  for (const [k, v] of parameters.entries()) {
    authorizationEndpoint.searchParams.append(k, v);
  }
  return authorizationEndpoint;
}
function checkConfig(input) {
  if (!(input instanceof Configuration)) {
    throw CodedTypeError2('"config" must be an instance of Configuration', ERR_INVALID_ARG_TYPE2);
  }
  if (Object.getPrototypeOf(input) !== Configuration.prototype) {
    throw CodedTypeError2("subclassing Configuration is not allowed", ERR_INVALID_ARG_VALUE2);
  }
}
function signal2(timeout) {
  return timeout ? AbortSignal.timeout(timeout * 1e3) : void 0;
}
function retryable(err, options) {
  if (options?.DPoP && options.flag !== retry) {
    return isDPoPNonceError(err);
  }
  return false;
}
var retry = Symbol();

// packages/iam/client.mjs
import { DatabaseSync } from "node:sqlite";
import { randomBytes as randomBytes2, createHash, createHmac, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
var hash = (v) => createHash("sha256").update(v).digest("hex");
var random = () => randomBytes2(32).toString("base64url");
var fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
function createIAM(options) {
  const { issuer, clientId, clientSecret, origin, webhookSecret, systemId, onIdentity } = options;
  if (!issuer || !clientId || !clientSecret || !origin || !webhookSecret || !systemId || !onIdentity) throw new Error("IAM configuration is incomplete");
  for (const value of [issuer, origin]) {
    const url = new URL(value);
    if (url.origin !== value || url.username || url.password || !value.startsWith("https://") && !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(value)) throw new Error("IAM requires an exact HTTPS origin");
  }
  const filename = options.database;
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 448 });
  const db = new DatabaseSync(filename);
  fs.chmodSync(filename, 384);
  db.exec("PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS iam_sessions(hash TEXT PRIMARY KEY,payload TEXT,expires INTEGER); CREATE TABLE IF NOT EXISTS iam_states(hash TEXT PRIMARY KEY,payload TEXT,expires INTEGER); CREATE TABLE IF NOT EXISTS iam_events(id TEXT PRIMARY KEY,created INTEGER);");
  const name = "iam_" + hash(clientId).slice(0, 12), stateName = name + "_state", secure = origin.startsWith("https:");
  const stateCookie = (state) => stateName + "_" + hash(state).slice(0, 16);
  const getCookie = (req, key) => (req.headers.get("cookie") || "").split(";").map((s) => s.trim()).find((s) => s.startsWith(key + "="))?.slice(key.length + 1) || "";
  const cookie = (key, value, max = 28800) => `${key}=${value}; Path=/api; HttpOnly; SameSite=Lax; Max-Age=${max}${secure ? "; Secure" : ""}`;
  let configPromise;
  const config = () => configPromise || (configPromise = discovery(new URL(issuer), clientId, clientSecret, ClientSecretPost2(clientSecret), { timeout: 8, execute: [enableNonRepudiationChecks, ...issuer.startsWith("http:") ? [allowInsecureRequests2] : []] }).catch((e2) => {
    configPromise = null;
    throw e2;
  }));
  const json = async (r) => {
    const body = await r.text();
    if (body.length > 65536) fail(503, "\u7EDF\u4E00\u8EAB\u4EFD\u54CD\u5E94\u8FC7\u5927");
    return JSON.parse(body);
  };
  const liveUser = async (token) => {
    const r = await fetch(issuer + "/api/v1/me", { headers: { authorization: "Bearer " + token }, redirect: "error", signal: AbortSignal.timeout(8e3) });
    if (!r.ok) fail([400, 401, 403, 428].includes(r.status) ? r.status : 503, "\u7EDF\u4E00\u8D26\u53F7\u5931\u6548\u3001\u672A\u6388\u6743\u6216\u9700\u8981\u4FEE\u6539\u521D\u59CB\u5BC6\u7801");
    return json(r);
  };
  const checkedIdentity = async (user, subject) => {
    if (user?.id !== subject || user.auth_user_id !== subject || user.system_id !== systemId || user.status !== "active" || user.deleted_at || user.must_change) fail(403, "\u7EDF\u4E00\u8D26\u53F7\u672A\u83B7\u4EBA\u624D\u7CFB\u7EDF\u6388\u6743");
    return onIdentity(user);
  };
  const locks = /* @__PURE__ */ new Map();
  async function current(req) {
    const key = hash(getCookie(req, name)), row = db.prepare("SELECT * FROM iam_sessions WHERE hash=? AND expires>?").get(key, Date.now());
    if (!row) return null;
    let payload = JSON.parse(row.payload);
    try {
      if (payload.expires_at < Date.now() + 3e4) {
        if (!locks.has(key)) locks.set(key, (async () => {
          const tokens = await refreshTokenGrant(await config(), payload.refresh_token);
          if (tokens.claims()?.sub && tokens.claims().sub !== payload.subject) fail(403, "\u7EDF\u4E00\u8EAB\u4EFD\u4E0D\u5339\u914D");
          const next = { ...payload, ...tokens, expires_at: Date.now() + (tokens.expires_in || 600) * 1e3 };
          const changed = db.prepare("UPDATE iam_sessions SET payload=? WHERE hash=?").run(JSON.stringify(next), key);
          if (!changed.changes) fail(401, "\u767B\u5F55\u5DF2\u5931\u6548");
          return next;
        })().finally(() => locks.delete(key)));
        payload = await locks.get(key);
      }
      const user = await liveUser(payload.access_token), local = await checkedIdentity(user, payload.subject);
      return { ...user, local, csrf: payload.csrf };
    } catch (e2) {
      if ([400, 401, 403, 428].includes(e2.status)) db.prepare("DELETE FROM iam_sessions WHERE hash=?").run(key);
      throw e2;
    }
  }
  async function handle(req) {
    const url = new URL(req.url);
    if (url.origin !== origin) fail(400, "\u8BF7\u6C42\u5730\u5740\u65E0\u6548");
    if (url.pathname === "/api/iam/login" && req.method === "GET") {
      const state = randomState(), nonce = randomNonce(), verifier = randomPKCECodeVerifier(), challenge = await calculatePKCECodeChallenge2(verifier);
      const returnTo = url.searchParams.get("returnTo") || "/";
      if (!/^\/(?!\/)/.test(returnTo) || /[\\\r\n]/.test(returnTo) || new URL(returnTo, origin).origin !== origin) fail(400, "\u8FD4\u56DE\u5730\u5740\u65E0\u6548");
      db.prepare("DELETE FROM iam_states WHERE expires<?").run(Date.now());
      db.prepare("DELETE FROM iam_sessions WHERE expires<?").run(Date.now());
      if (db.prepare("SELECT count(*) n FROM iam_states").get().n >= 1e3) fail(429, "\u767B\u5F55\u8BF7\u6C42\u8FC7\u591A\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5");
      const target = buildAuthorizationUrl(await config(), { redirect_uri: origin + "/api/iam/callback", scope: "openid profile offline_access", response_type: "code", response_mode: "query", prompt: "consent", state, nonce, code_challenge: challenge, code_challenge_method: "S256" });
      db.prepare("INSERT INTO iam_states VALUES(?,?,?)").run(hash(state), JSON.stringify({ state, nonce, verifier, returnTo }), Date.now() + 6e5);
      return new Response(null, { status: 302, headers: { location: target.href, "set-cookie": cookie(stateCookie(state), state, 600) } });
    }
    if (url.pathname === "/api/iam/callback" && req.method === "GET") {
      const state = url.searchParams.get("state");
      if (!state || state !== getCookie(req, stateCookie(state)) && state !== getCookie(req, stateName)) fail(400, "\u767B\u5F55\u72B6\u6001\u6821\u9A8C\u5931\u8D25");
      const row = db.prepare("SELECT payload FROM iam_states WHERE hash=? AND expires>?").get(hash(state), Date.now());
      if (!row) fail(400, "\u767B\u5F55\u8BF7\u6C42\u5DF2\u8FC7\u671F\u6216\u5DF2\u7ECF\u4F7F\u7528");
      db.prepare("DELETE FROM iam_states WHERE hash=?").run(hash(state));
      const pending = JSON.parse(row.payload);
      const tokens = await authorizationCodeGrant(await config(), url, { pkceCodeVerifier: pending.verifier, expectedState: state, expectedNonce: pending.nonce, idTokenExpected: true });
      const subject = tokens.claims()?.sub;
      if (!subject || !tokens.refresh_token) fail(403, "\u7EDF\u4E00\u8EAB\u4EFD\u6216\u5237\u65B0\u4EE4\u724C\u7F3A\u5931");
      const user = await liveUser(tokens.access_token);
      await checkedIdentity(user, subject);
      const token = random(), headers2 = new Headers({ location: pending.returnTo });
      db.prepare("INSERT INTO iam_sessions VALUES(?,?,?)").run(hash(token), JSON.stringify({ ...tokens, subject, csrf: random(), expires_at: Date.now() + (tokens.expires_in || 600) * 1e3 }), Date.now() + 288e5);
      headers2.append("set-cookie", cookie(name, token));
      headers2.append("set-cookie", cookie(stateCookie(state), "", 0));
      return new Response(null, { status: 302, headers: headers2 });
    }
    if (url.pathname === "/api/iam/webhook" && req.method === "POST") {
      const timestamp = req.headers.get("x-iam-timestamp") || "", signature = req.headers.get("x-iam-signature") || "";
      if (!/^\d+$/.test(timestamp) || Math.abs(Date.now() - Number(timestamp)) > 3e5) fail(401, "\u540C\u6B65\u7B7E\u540D\u5DF2\u8FC7\u671F");
      const body = await req.text();
      if (Buffer.byteLength(body) > 256e3) fail(413, "\u540C\u6B65\u6570\u636E\u8FC7\u5927");
      const expected = createHmac("sha256", webhookSecret).update(timestamp + "." + body).digest("hex");
      if (!/^[0-9a-f]{64}$/.test(signature) || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) fail(401, "\u540C\u6B65\u7B7E\u540D\u65E0\u6548");
      let event;
      try {
        event = JSON.parse(body);
      } catch {
        fail(400, "\u540C\u6B65\u4E8B\u4EF6\u683C\u5F0F\u9519\u8BEF");
      }
      if (typeof event.event_id !== "string" || event.event_id.length > 128 || typeof event.user?.id !== "string" || event.system_id !== systemId) fail(400, "\u540C\u6B65\u4E8B\u4EF6\u683C\u5F0F\u9519\u8BEF");
      if (!db.prepare("SELECT id FROM iam_events WHERE id=?").get(event.event_id)) {
        const r = await fetch(issuer + "/api/v1/service/users/" + encodeURIComponent(event.user.id), { headers: { "x-client-id": clientId, "x-client-secret": clientSecret }, redirect: "error", signal: AbortSignal.timeout(8e3) });
        db.prepare("DELETE FROM iam_sessions WHERE json_extract(payload,'$.subject')=?").run(event.user.id);
        if (r.ok) {
          const user = await json(r);
          try {
            await checkedIdentity(user, event.user.id);
          } catch (e2) {
            if (e2.status !== 403) throw e2;
          }
        } else if (r.status !== 403) fail(r.status === 401 ? 401 : 503, "\u540C\u6B65\u67E5\u8BE2\u5931\u8D25");
        db.prepare("INSERT OR IGNORE INTO iam_events VALUES(?,?)").run(event.event_id, Date.now());
      }
      return Response.json({ ok: true, event_id: event.event_id });
    }
    if (url.pathname === "/api/iam/session" && req.method === "GET") {
      const user = await current(req);
      return Response.json({ user: user ? { id: user.id, name: user.name, roles: user.roles, permissions: user.permissions, csrf: user.csrf } : null });
    }
    if (url.pathname === "/api/iam/logout" && req.method === "POST") {
      if (req.headers.get("origin") !== origin) fail(403, "\u8BF7\u6C42\u6765\u6E90\u65E0\u6548");
      const row = db.prepare("SELECT payload FROM iam_sessions WHERE hash=? AND expires>?").get(hash(getCookie(req, name)), Date.now());
      if (!row || req.headers.get("x-csrf-token") !== JSON.parse(row.payload).csrf) fail(403, "\u4F1A\u8BDD\u6821\u9A8C\u5931\u8D25");
      db.prepare("DELETE FROM iam_sessions WHERE hash=?").run(hash(getCookie(req, name)));
      return Response.json({ ok: true }, { headers: { "set-cookie": cookie(name, "", 0) } });
    }
    return new Response("Not found", { status: 404 });
  }
  return { handle, current, close: () => db.close() };
}
export {
  createIAM
};
