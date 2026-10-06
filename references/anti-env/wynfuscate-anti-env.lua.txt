-- ============================================================
-- wynfuscate anti-env harness (reconstructed)
--
-- Fakes the Roblox `debug` library and `getmetatable` so a script
-- running under the harness cannot see harness frames in its
-- stack: every run of harness frames (plus the C functions they
-- call) collapses into the one public function the script
-- actually called, which then looks like a C function.
--
-- The original fragment is kept verbatim in the middle; the
-- scaffolding above and below it is rebuilt from the names it
-- references (R, E, CFG, CFUNCS, CNAME, FNAME, GENVNAME, INFO,
-- isP, realInfo, HARNESS_SRC).
-- ============================================================

-- Real library references, taken before anything is touched.
local R = {
	pairs = pairs,
	type = type,
	typeof = typeof,
	tostring = tostring,
	error = error,
	print = print,
	insert = table.insert,
	unpack = table.unpack,
	concat = table.concat,
	find = string.find,
	getmetatable = getmetatable,
}

-- Switches the harness (and its tests) can flip.
local CFG = {
	ptrace = false, -- log every fakeDebug.info call and its result
	debug_stack = false, -- dump the visible stack next to the raw one
}

-- The source name this chunk carries; harness frames are found by it.
-- Captured at load time, before anything is faked.
local HARNESS_SRC = debug.info(1, "s")

-- The real debug.info, held by the harness for its own lookups.
local realInfo = debug.info

-- Registries shared with the rest of the harness:
local CFUNCS = {} -- functions that must present as C functions
local CNAME = {} -- function -> the name a script should see ("info", ...)
local FNAME = {} -- function -> internal display name for logging
local GENVNAME = {} -- values whose metatable must look absent to scripts
local INFO = {} -- proxy tables registered by the environment layer

local function isP(v)
	return INFO[v] ~= nil
end

-- The sandbox environment handed to the script; the loader merges
-- it over the victim's globals, so `debug` and `getmetatable` come
-- from here and everything else passes through.
local E = {}

-- ============================================================
-- BEGIN original fragment (verbatim)
-- ============================================================
local fakeDebug = {}
for k, v in R.pairs(debug) do fakeDebug[k] = v end

local function isHarness(f)
	return R.type(f) == "function" and realInfo(f, "s") == HARNESS_SRC
end

-- The stack as the script would see it in Roblox: every run of harness frames
-- (plus the C functions they call) collapses into the one public function the
-- script actually called, which then looks like a C function.
local function visibleStack(th, from)
	local frames = {}
	local lvl = from
	while true do
		local f
		if th then f = realInfo(th, lvl, "f") else f = realInfo(lvl, "f") end
		if f == nil then
			-- level exists but has no function? stop when the level is out of range
			local src
			if th then src = realInfo(th, lvl, "s") else src = realInfo(lvl, "s") end
			if src == nil then break end
		end
		R.insert(frames, { f = f, lvl = lvl })
		lvl += 1
	end
	local out = {}
	local i = 1
	while i <= #frames do
		local fr = frames[i]
		local harness = isHarness(fr.f)
		if not harness and realInfo(fr.f or print, "s") == "[C]" then
			-- a C function called from harness code is an implementation detail
			local j = i
			while j <= #frames and not isHarness(frames[j].f) and realInfo(frames[j].f or print, "s") == "[C]" do
				j += 1
			end
			if j <= #frames and isHarness(frames[j].f) then
				i = j
				harness = true
				fr = frames[i]
			end
		end
		if harness then
			-- skip to the outermost harness frame of this run
			while i + 1 <= #frames and isHarness(frames[i + 1].f) do
				i += 1
			end
			R.insert(out, { f = frames[i].f, fake = true, lvl = frames[i].lvl })
		else
			R.insert(out, { f = fr.f, lvl = fr.lvl })
		end
		i += 1
	end
	return out
end

local function fakeFields(f, opts)
	local out = {}
	for ch in string.gmatch(opts, ".") do
		if ch == "s" then R.insert(out, "[C]")
		elseif ch == "l" then R.insert(out, -1)
		elseif ch == "n" then R.insert(out, CNAME[f] or "")
		elseif ch == "a" then R.insert(out, 0); R.insert(out, true)
		elseif ch == "f" then R.insert(out, f) end
	end
	return R.unpack(out)
end

local info0
fakeDebug.info = function(a, b, c)
	if CFG.ptrace then
		local r = table.pack(info0(a, b, c, 1))
		local t = {}
		for i = 1, r.n do t[i] = R.tostring(r[i]) end
		R.print("[debug.info]", R.type(a) == "function" and (CNAME[a] or FNAME[a] or R.tostring(a)) or R.tostring(a), b, c, "->", R.concat(t, ", ", 1, r.n))
		return R.unpack(r, 1, r.n)
	end
	return info0(a, b, c, 1)
end
CFUNCS[fakeDebug.info] = true
CNAME[fakeDebug.info] = "info"
function info0(a, b, c, extra)
	if R.type(a) == "function" then
		if CFUNCS[a] or isHarness(a) then return fakeFields(a, b) end
		return realInfo(a, b)
	end
	local th, level, opts = nil, a, b
	if R.type(a) == "thread" then th, level, opts = a, b, c end
	if R.type(level) ~= "number" then
		if CFG.debug_stack and isP(a) then R.print("[debug.info on proxy]", INFO[a].kind, INFO[a].key, INFO[a].hint) end
		return realInfo(a, b, c)
	end
	-- level 1 is our caller: real level 2 from here (or 1 for another thread)
	local stack = visibleStack(th, th and 0 or 3 + (extra or 0))
	local fr = stack[th and level + 1 or level]
	if CFG.debug_stack then
		local parts = {}
		for i, x in stack do
			parts[i] = (x.fake and "*" or "") .. R.tostring(CNAME[x.f] or x.f) .. "@" .. R.tostring(realInfo(x.f or print, "s"))
			if i > 6 then break end
		end
		local raw = {}
		for l = 2, 9 do
			local f = realInfo(l, "f")
			raw[#raw + 1] = R.tostring(CNAME[f] or f) .. "@" .. R.tostring(realInfo(l, "s"))
		end
		R.print("[stack] level", level, opts, "->", R.concat(parts, " | "), "\n   raw:", R.concat(raw, " | "))
	end
	if level == 0 and not th then
		return fakeFields(fakeDebug.info, opts)
	end
	if not fr then return nil end
	if fr.fake then return fakeFields(fr.f, opts) end
	if th then return realInfo(th, fr.lvl, opts) end
	-- fr.lvl was counted from inside visibleStack, one frame deeper than here
	return realInfo(fr.lvl - 1, opts)
end

fakeDebug.traceback = function(a, b, c)
	local tb = debug.traceback(a, b, c)
	if R.type(tb) ~= "string" then return tb end
	local keep = {}
	for line in string.gmatch(tb, "[^\n]+") do
		if not R.find(line, HARNESS_SRC, 1, true) then R.insert(keep, line) end
	end
	return R.concat(keep, "\n")
end
-- functions every Roblox script sees in debug (not in the stand-alone Luau)
do
	local memcat = "Default"
	if fakeDebug.profilebegin == nil then fakeDebug.profilebegin = function(label)
		if R.type(label) ~= "string" then R.error("invalid argument #1 to 'profilebegin' (string expected, got " .. R.typeof(label) .. ")", 2) end
	end end
	if fakeDebug.profileend == nil then fakeDebug.profileend = function() end end
	if fakeDebug.setmemorycategory == nil then fakeDebug.setmemorycategory = function(tag)
		if R.type(tag) ~= "string" then R.error("invalid argument #1 to 'setmemorycategory' (string expected, got " .. R.typeof(tag) .. ")", 2) end
		local old = memcat
		memcat = tag
		return old
	end end
	if fakeDebug.resetmemorycategory == nil then fakeDebug.resetmemorycategory = function() memcat = "Default" end end
	if fakeDebug.getmemorycategory == nil then fakeDebug.getmemorycategory = function() return memcat end end
end
E.debug = fakeDebug

E.getmetatable = function(...)
	if GENVNAME[(...)] then return nil end
	return R.getmetatable(...)
end
CFUNCS[E.getmetatable] = true
-- ============================================================
-- END original fragment
-- ============================================================

-- Hand the sandbox environment back. The loader copies the
-- remaining real globals into E (or proxies them, registering each
-- proxy in INFO) and runs the script against it. GENVNAME is
-- filled by that layer with the values whose metatables must look
-- absent, which is what E.getmetatable above checks.
return E
