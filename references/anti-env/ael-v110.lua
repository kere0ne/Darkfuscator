--!strict
--!optimize 2
--!nolint DeprecatedApi
--!nolint DeprecatedGlobal

--[[
    For non-executor Roblox
]]

local NO_STACK_OVERFLOW_CHECKS = false
local NO_SCRIPT_GLOBAL_CHECKS = false
local NO_LINE_CHECKS = false
local TAG = "Anti-Environment Logger"

local sthread, selfinfo, source, line, name, paramcount, variadic, self = ...

if not sthread then
    local self2: (...any) -> ...any = debug.info(1, `f\0{TAG}`)
    task.spawn(self2, coroutine.running(), table.pack(debug.info(self2, `slnaf\0{TAG}`)), debug.info(1, `slna\0f{TAG}`))
    return
end

local LUAI_MAXCCALLS = 200
local LUAI_FMAXCCALLS = LUAI_MAXCCALLS + 0.99999999999997
local INT_MAX = 2 ^ 31 - 1
local INT_FMAX = INT_MAX + 0.9999998
local UINT_MAX = 2 ^ 32 - 1
local UINT_FMAX = UINT_MAX + 0.9999995
local STR_MAX = 2 ^ 30
local STR_FMAX = STR_MAX + 0.9999999
local I8_MAX = 2 ^ 8 - 1
local I8_FMAX = I8_MAX + 0.99999999999997
local UCODE_MAX = I8_MAX
local UCODE_FMAX = I8_FMAX
local CAPTURE_MAX = 32
local CAPTURE_FMAX = 32 + 0.99999999999999
local NOISE_SMALL = 1.1754943157898259e-38

(function()
    assert(type(sthread) == "thread", "[1] Recall Varargs")
    assert(coroutine.status(sthread) == "normal", "[2] Recall Varargs")

    local fullName = NO_SCRIPT_GLOBAL_CHECKS and debug.info(1, "s") or (game :: any).getFullName(script)
    assert(source == fullName and selfinfo[1] == fullName, "[4] Recall Varargs")
    if NO_LINE_CHECKS then
        assert(selfinfo[2] == 1, "[5] Recall Varargs")
    else
        assert(line == 19 and selfinfo[2] == 1, "[5] Recall Varargs")
    end
    assert(name == "" and selfinfo[3] == "", "[6] Recall Varargs")
    assert(paramcount == 0 and selfinfo[4] == 0, "[7] Recall Varargs")
    assert(variadic == true and selfinfo[5] == true, "[8] Recall Varargs")
    assert(self == nil and selfinfo[6] == debug.info(1, "f"), "[9] Recall Varargs")

    assert(debug.info(debug.info, `n\0{TAG}`) == "info", "debug.info Name")
    assert(selfinfo.n == 6, "table.pack | debug.info")
    assert(table.pack(debug.info(pcall, `sl\0naf{TAG}`)).n == 2, "debug.info")

    assert(ypcall, "Missing Global ypcall")
    assert(_G, "Missing Global _G")
    assert(shared, "Missing Global shared")
    if not NO_SCRIPT_GLOBAL_CHECKS then
        assert(script, "Missing Global script")
    end
    assert(Workspace, "Missing Global Workspace")
    assert(Game, "Missing Global Game")
end)()

-- // Generated Global Checks
local __instance: ObjectValue
local __instanceIndex: (...any) -> ...any
local __instanceNC: (...any) -> ...any
local __random: Random
local __randomNC: (...any) -> ...any
local __color3Index: (...any) -> ...any
local __color3NC: (...any) -> ...any
local _src: any, _line: any, _name: any, _pc: any, _va: any
local __color3: Color3, __cframe: CFrame, __vector3: Vector3, __vector3int16: Vector3int16
local __datetime: DateTime, __datetimeIndex: (...any) -> ...any, __datetimeNC: (...any) -> ...any
;(function()
    assert(DockWidgetPluginGuiInfo, "Missing Global DockWidgetPluginGuiInfo")
    assert(DockWidgetPluginGuiInfo.new, "Missing Global DockWidgetPluginGuiInfo.new")
    _src, _line, _name, _pc, _va = debug.info(DockWidgetPluginGuiInfo.new, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "new" and _pc == 0 and _va == true, "Global DockWidgetPluginGuiInfo.new Debug Info")
    local __dockwidgetpluginguiinfo: any = (DockWidgetPluginGuiInfo.new :: any)()
    assert(typeof(__dockwidgetpluginguiinfo) == "DockWidgetPluginGuiInfo", "DockWidgetPluginGuiInfo Type")

    assert(string, "Missing Global string")
    assert(string.find, "Missing Global string.find")
    _src, _line, _name, _pc, _va = debug.info(string.find, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "find" and _pc == 0 and _va == true, "Global string.find Debug Info")
    assert(pcall(string.find :: any, "", "", nil, true), "string.find")
    assert(string.match, "Missing Global string.match")
    _src, _line, _name, _pc, _va = debug.info(string.match, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "match" and _pc == 0 and _va == true, "Global string.match Debug Info")
    local __string: any = (string.match :: any)("", "")
    assert(typeof(__string) == "string", "string Type")

    assert(CFrame, "Missing Global CFrame")
    assert(CFrame.Angles, "Missing Global CFrame.Angles")
    _src, _line, _name, _pc, _va = debug.info(CFrame.Angles, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "Angles" and _pc == 0 and _va == true, "Global CFrame.Angles Debug Info")
    assert(pcall(CFrame.Angles :: any, 1, 1, 1), "CFrame.Angles")
    assert(CFrame.fromEulerAnglesYXZ, "Missing Global CFrame.fromEulerAnglesYXZ")
    _src, _line, _name, _pc, _va = debug.info(CFrame.fromEulerAnglesYXZ, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "fromEulerAnglesYXZ" and _pc == 0 and _va == true, "Global CFrame.fromEulerAnglesYXZ Debug Info")
    assert(pcall(CFrame.fromEulerAnglesYXZ :: any, 1, 1, 1), "CFrame.fromEulerAnglesYXZ")
    assert(CFrame.new, "Missing Global CFrame.new")
    _src, _line, _name, _pc, _va = debug.info(CFrame.new, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "new" and _pc == 0 and _va == true, "Global CFrame.new Debug Info")
    assert(pcall(CFrame.new :: any), "CFrame.new")
    assert(CFrame.lookAlong, "Missing Global CFrame.lookAlong")
    _src, _line, _name, _pc, _va = debug.info(CFrame.lookAlong, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "lookAlong" and _pc == 0 and _va == true, "Global CFrame.lookAlong Debug Info")
    assert(pcall(CFrame.lookAlong :: any, vector.zero :: any, vector.zero :: any), "CFrame.lookAlong")
    assert(CFrame.fromEulerAnglesXYZ, "Missing Global CFrame.fromEulerAnglesXYZ")
    _src, _line, _name, _pc, _va = debug.info(CFrame.fromEulerAnglesXYZ, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "fromEulerAnglesXYZ" and _pc == 0 and _va == true, "Global CFrame.fromEulerAnglesXYZ Debug Info")
    assert(pcall(CFrame.fromEulerAnglesXYZ :: any, 1, 1, 1), "CFrame.fromEulerAnglesXYZ")
    assert(CFrame.fromRotationBetweenVectors, "Missing Global CFrame.fromRotationBetweenVectors")
    _src, _line, _name, _pc, _va = debug.info(CFrame.fromRotationBetweenVectors, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "fromRotationBetweenVectors" and _pc == 0 and _va == true, "Global CFrame.fromRotationBetweenVectors Debug Info")
    assert(pcall(CFrame.fromRotationBetweenVectors :: any, vector.zero :: any, vector.zero :: any), "CFrame.fromRotationBetweenVectors")
    assert(CFrame.fromOrientation, "Missing Global CFrame.fromOrientation")
    _src, _line, _name, _pc, _va = debug.info(CFrame.fromOrientation, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "fromOrientation" and _pc == 0 and _va == true, "Global CFrame.fromOrientation Debug Info")
    assert(pcall(CFrame.fromOrientation :: any, 1, 1, 1), "CFrame.fromOrientation")
    assert(CFrame.fromMatrix, "Missing Global CFrame.fromMatrix")
    _src, _line, _name, _pc, _va = debug.info(CFrame.fromMatrix, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "fromMatrix" and _pc == 0 and _va == true, "Global CFrame.fromMatrix Debug Info")
    assert(pcall(CFrame.fromMatrix :: any, vector.zero :: any, vector.zero :: any, vector.zero :: any), "CFrame.fromMatrix")
    assert(CFrame.lookAt, "Missing Global CFrame.lookAt")
    _src, _line, _name, _pc, _va = debug.info(CFrame.lookAt, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "lookAt" and _pc == 0 and _va == true, "Global CFrame.lookAt Debug Info")
    assert(pcall(CFrame.lookAt :: any, vector.zero :: any, vector.zero :: any, vector.zero :: any), "CFrame.lookAt")
    assert(CFrame.fromAxisAngle, "Missing Global CFrame.fromAxisAngle")
    _src, _line, _name, _pc, _va = debug.info(CFrame.fromAxisAngle, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "fromAxisAngle" and _pc == 0 and _va == true, "Global CFrame.fromAxisAngle Debug Info")
    assert(pcall(CFrame.fromAxisAngle :: any, vector.zero :: any, 1), "CFrame.fromAxisAngle")
    assert(CFrame.fromEulerAngles, "Missing Global CFrame.fromEulerAngles")
    _src, _line, _name, _pc, _va = debug.info(CFrame.fromEulerAngles, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "fromEulerAngles" and _pc == 0 and _va == true, "Global CFrame.fromEulerAngles Debug Info")
    __cframe = (CFrame.fromEulerAngles :: any)(1, 1, 1)
    assert(typeof(__cframe) == "CFrame", "CFrame Type")
    assert(pcall(function() return __cframe.Position end), "[1] CFrame __index")
    local __cframeIndex: (...any) -> ...any
    xpcall(function() return (__cframe :: any).____ end, function()
        __cframeIndex = debug.info(2, "f")
    end)
    assert(type(__cframeIndex) == "function", "CFrame __index")
    _src, _line, _name, _pc, _va = debug.info(__cframeIndex, "slna")
    assert(type(__cframeIndex) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true, "[2] CFrame __index")
    local __cframeNC: (...any) -> ...any
    xpcall(function() return (__cframe :: any):____() end, function()
        __cframeNC = debug.info(2, "f")
    end)
    assert(type(__cframeNC) == "function", "CFrame __namecall")
    _src, _line, _name, _pc, _va = debug.info(__cframeNC, "slna")
    assert(type(__cframeNC) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true and __cframeNC ~= __cframeIndex, "CFrame __namecall")
    assert(getmetatable(__cframe) == "The metatable is locked", "CFrame Metatable Access")

    assert(DateTime, "Missing Global DateTime")
    assert(DateTime.fromLocalTime, "Missing Global DateTime.fromLocalTime")
    _src, _line, _name, _pc, _va = debug.info(DateTime.fromLocalTime, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "fromLocalTime" and _pc == 0 and _va == true, "Global DateTime.fromLocalTime Debug Info")
    assert(pcall(DateTime.fromLocalTime :: any), "DateTime.fromLocalTime")
    assert(DateTime.fromIsoDate, "Missing Global DateTime.fromIsoDate")
    _src, _line, _name, _pc, _va = debug.info(DateTime.fromIsoDate, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "fromIsoDate" and _pc == 0 and _va == true, "Global DateTime.fromIsoDate Debug Info")
    assert(pcall(DateTime.fromIsoDate :: any, "2026-01-28T02:32:35Z"), "DateTime.fromIsoDate")
    assert(DateTime.fromUnixTimestamp, "Missing Global DateTime.fromUnixTimestamp")
    _src, _line, _name, _pc, _va = debug.info(DateTime.fromUnixTimestamp, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "fromUnixTimestamp" and _pc == 0 and _va == true, "Global DateTime.fromUnixTimestamp Debug Info")
    assert(pcall(DateTime.fromUnixTimestamp :: any, 1), "DateTime.fromUnixTimestamp")
    assert(DateTime.now, "Missing Global DateTime.now")
    _src, _line, _name, _pc, _va = debug.info(DateTime.now, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "now" and _pc == 0 and _va == true, "Global DateTime.now Debug Info")
    assert(pcall(DateTime.now :: any), "DateTime.now")
    assert(DateTime.fromUnixTimestampMillis, "Missing Global DateTime.fromUnixTimestampMillis")
    _src, _line, _name, _pc, _va = debug.info(DateTime.fromUnixTimestampMillis, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "fromUnixTimestampMillis" and _pc == 0 and _va == true, "Global DateTime.fromUnixTimestampMillis Debug Info")
    assert(pcall(DateTime.fromUnixTimestampMillis :: any, 1), "DateTime.fromUnixTimestampMillis")
    assert(DateTime.fromUniversalTime, "Missing Global DateTime.fromUniversalTime")
    _src, _line, _name, _pc, _va = debug.info(DateTime.fromUniversalTime, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "fromUniversalTime" and _pc == 0 and _va == true, "Global DateTime.fromUniversalTime Debug Info")
    __datetime = (DateTime.fromUniversalTime :: any)()
    assert(typeof(__datetime) == "DateTime", "DateTime Type")
    assert(pcall(function() return __datetime.UnixTimestamp end), "[1] DateTime __index")
    xpcall(function() return (__datetime :: any).____ end, function()
        __datetimeIndex = debug.info(2, "f")
    end)
    assert(type(__datetimeIndex) == "function", "DateTime __index")
    _src, _line, _name, _pc, _va = debug.info(__datetimeIndex, "slna")
    assert(type(__datetimeIndex) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true, "[2] DateTime __index")
    xpcall(function() return (__datetime :: any):____() end, function()
        __datetimeNC = debug.info(2, "f")
    end)
    assert(type(__datetimeNC) == "function", "DateTime __namecall")
    _src, _line, _name, _pc, _va = debug.info(__datetimeNC, "slna")
    assert(type(__datetimeNC) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true and __datetimeNC ~= __datetimeIndex, "DateTime __namecall")
    assert(getmetatable(__datetime) == "The metatable is locked", "DateTime Metatable Access")

    assert(table, "Missing Global table")
    assert(table.clear, "Missing Global table.clear")
    _src, _line, _name, _pc, _va = debug.info(table.clear, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "clear" and _pc == 0 and _va == true, "Global table.clear Debug Info")
    assert(pcall(table.clear :: any, {}), "table.clear")
    assert(table.pack, "Missing Global table.pack")
    _src, _line, _name, _pc, _va = debug.info(table.pack, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "pack" and _pc == 0 and _va == true, "Global table.pack Debug Info")
    assert(pcall(table.pack :: any), "table.pack")
    assert(table.move, "Missing Global table.move")
    _src, _line, _name, _pc, _va = debug.info(table.move, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "move" and _pc == 0 and _va == true, "Global table.move Debug Info")
    assert(pcall(table.move :: any, {}, 1, 1, 1, {}), "table.move")
    assert(table.find, "Missing Global table.find")
    _src, _line, _name, _pc, _va = debug.info(table.find, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "find" and _pc == 0 and _va == true, "Global table.find Debug Info")
    assert(pcall(table.find :: any, {}, 1), "table.find")
    assert(table.isfrozen, "Missing Global table.isfrozen")
    _src, _line, _name, _pc, _va = debug.info(table.isfrozen, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "isfrozen" and _pc == 0 and _va == true, "Global table.isfrozen Debug Info")
    assert(pcall(table.isfrozen :: any, {}), "table.isfrozen")
    assert(table.clone, "Missing Global table.clone")
    _src, _line, _name, _pc, _va = debug.info(table.clone, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "clone" and _pc == 0 and _va == true, "Global table.clone Debug Info")
    assert(pcall(table.clone :: any, {}), "table.clone")
    assert(table.unpack, "Missing Global table.unpack")
    _src, _line, _name, _pc, _va = debug.info(table.unpack, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "unpack" and _pc == 0 and _va == true, "Global table.unpack Debug Info")
    assert(pcall(table.unpack :: any, {}), "table.unpack")
    assert(table.remove, "Missing Global table.remove")
    _src, _line, _name, _pc, _va = debug.info(table.remove, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "remove" and _pc == 0 and _va == true, "Global table.remove Debug Info")
    assert(pcall(table.remove :: any, {}), "table.remove")
    assert(table.getn, "Missing Global table.getn")
    _src, _line, _name, _pc, _va = debug.info(table.getn, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "getn" and _pc == 0 and _va == true, "Global table.getn Debug Info")
    assert(pcall(table.getn :: any, {}), "table.getn")
    local __table: any = (table.create :: any)(1)
    assert(typeof(__table) == "table", "table Type")

    assert(TweenInfo, "Missing Global TweenInfo")
    assert(TweenInfo.new, "Missing Global TweenInfo.new")
    _src, _line, _name, _pc, _va = debug.info(TweenInfo.new, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "new" and _pc == 0 and _va == true, "Global TweenInfo.new Debug Info")
    local __tweeninfo: any = (TweenInfo.new :: any)()
    assert(typeof(__tweeninfo) == "TweenInfo", "TweenInfo Type")
    assert(pcall(function() return __tweeninfo.EasingDirection end), "[1] TweenInfo __index")
    local __tweeninfoIndex: (...any) -> ...any
    xpcall(function() return (__tweeninfo :: any).____ end, function()
        __tweeninfoIndex = debug.info(2, "f")
    end)
    assert(type(__tweeninfoIndex) == "function", "TweenInfo __index")
    _src, _line, _name, _pc, _va = debug.info(__tweeninfoIndex, "slna")
    assert(type(__tweeninfoIndex) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true, "[2] TweenInfo __index")
    local __tweeninfoNC: (...any) -> ...any
    xpcall(function() return (__tweeninfo :: any):____() end, function()
        __tweeninfoNC = debug.info(2, "f")
    end)
    assert(type(__tweeninfoNC) == "function", "TweenInfo __namecall")
    _src, _line, _name, _pc, _va = debug.info(__tweeninfoNC, "slna")
    assert(type(__tweeninfoNC) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true and __tweeninfoNC == __tweeninfoIndex, "TweenInfo __namecall")
    assert(getmetatable(__tweeninfo) == "The metatable is locked", "TweenInfo Metatable Access")

    assert(UDim, "Missing Global UDim")
    assert(UDim.new, "Missing Global UDim.new")
    _src, _line, _name, _pc, _va = debug.info(UDim.new, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "new" and _pc == 0 and _va == true, "Global UDim.new Debug Info")
    local __udim: any = (UDim.new :: any)()
    assert(typeof(__udim) == "UDim", "UDim Type")
    assert(pcall(function() return __udim.Scale end), "[1] UDim __index")
    local __udimIndex: (...any) -> ...any
    xpcall(function() return (__udim :: any).____ end, function()
        __udimIndex = debug.info(2, "f")
    end)
    assert(type(__udimIndex) == "function", "UDim __index")
    _src, _line, _name, _pc, _va = debug.info(__udimIndex, "slna")
    assert(type(__udimIndex) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true, "[2] UDim __index")
    local __udimNC: (...any) -> ...any
    xpcall(function() return (__udim :: any):____() end, function()
        __udimNC = debug.info(2, "f")
    end)
    assert(type(__udimNC) == "function", "UDim __namecall")
    _src, _line, _name, _pc, _va = debug.info(__udimNC, "slna")
    assert(type(__udimNC) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true and __udimNC == __udimIndex, "UDim __namecall")
    assert(getmetatable(__udim) == "The metatable is locked", "UDim Metatable Access")

    assert(Vector3int16, "Missing Global Vector3int16")
    assert(Vector3int16.new, "Missing Global Vector3int16.new")
    _src, _line, _name, _pc, _va = debug.info(Vector3int16.new, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "new" and _pc == 0 and _va == true, "Global Vector3int16.new Debug Info")
    __vector3int16 = (Vector3int16.new :: any)()
    assert(typeof(__vector3int16) == "Vector3int16", "Vector3int16 Type")
    assert(pcall(function() return __vector3int16.X end), "[1] Vector3int16 __index")
    local __vector3int16Index: (...any) -> ...any
    xpcall(function() return (__vector3int16 :: any).____ end, function()
        __vector3int16Index = debug.info(2, "f")
    end)
    assert(type(__vector3int16Index) == "function", "Vector3int16 __index")
    _src, _line, _name, _pc, _va = debug.info(__vector3int16Index, "slna")
    assert(type(__vector3int16Index) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true, "[2] Vector3int16 __index")
    local __vector3int16NC: (...any) -> ...any
    xpcall(function() return (__vector3int16 :: any):____() end, function()
        __vector3int16NC = debug.info(2, "f")
    end)
    assert(type(__vector3int16NC) == "function", "Vector3int16 __namecall")
    _src, _line, _name, _pc, _va = debug.info(__vector3int16NC, "slna")
    assert(type(__vector3int16NC) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true and __vector3int16NC == __vector3int16Index, "Vector3int16 __namecall")
    assert(getmetatable(__vector3int16) == "The metatable is locked", "Vector3int16 Metatable Access")

    assert(NumberSequence, "Missing Global NumberSequence")
    assert(NumberSequence.new, "Missing Global NumberSequence.new")
    _src, _line, _name, _pc, _va = debug.info(NumberSequence.new, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "new" and _pc == 0 and _va == true, "Global NumberSequence.new Debug Info")
    local __numbersequence: any = (NumberSequence.new :: any)(1)
    assert(typeof(__numbersequence) == "NumberSequence", "NumberSequence Type")
    assert(pcall(function() return __numbersequence.Keypoints end), "[1] NumberSequence __index")
    local __numbersequenceIndex: (...any) -> ...any
    xpcall(function() return (__numbersequence :: any).____ end, function()
        __numbersequenceIndex = debug.info(2, "f")
    end)
    assert(type(__numbersequenceIndex) == "function", "NumberSequence __index")
    _src, _line, _name, _pc, _va = debug.info(__numbersequenceIndex, "slna")
    assert(type(__numbersequenceIndex) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true, "[2] NumberSequence __index")
    local __numbersequenceNC: (...any) -> ...any
    xpcall(function() return (__numbersequence :: any):____() end, function()
        __numbersequenceNC = debug.info(2, "f")
    end)
    assert(type(__numbersequenceNC) == "function", "NumberSequence __namecall")
    _src, _line, _name, _pc, _va = debug.info(__numbersequenceNC, "slna")
    assert(type(__numbersequenceNC) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true and __numbersequenceNC == __numbersequenceIndex, "NumberSequence __namecall")
    assert(getmetatable(__numbersequence) == "The metatable is locked", "NumberSequence Metatable Access")

    assert(CatalogSearchParams, "Missing Global CatalogSearchParams")
    assert(CatalogSearchParams.new, "Missing Global CatalogSearchParams.new")
    _src, _line, _name, _pc, _va = debug.info(CatalogSearchParams.new, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "new" and _pc == 0 and _va == true, "Global CatalogSearchParams.new Debug Info")
    local __catalogsearchparams: any = (CatalogSearchParams.new :: any)()
    assert(typeof(__catalogsearchparams) == "CatalogSearchParams", "CatalogSearchParams Type")
    assert(pcall(function() return __catalogsearchparams.Limit end), "[1] CatalogSearchParams __index")
    local __catalogsearchparamsIndex: (...any) -> ...any
    xpcall(function() return (__catalogsearchparams :: any).____ end, function()
        __catalogsearchparamsIndex = debug.info(2, "f")
    end)
    assert(type(__catalogsearchparamsIndex) == "function", "CatalogSearchParams __index")
    _src, _line, _name, _pc, _va = debug.info(__catalogsearchparamsIndex, "slna")
    assert(type(__catalogsearchparamsIndex) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true, "[2] CatalogSearchParams __index")
    local __catalogsearchparamsNC: (...any) -> ...any
    xpcall(function() return (__catalogsearchparams :: any):____() end, function()
        __catalogsearchparamsNC = debug.info(2, "f")
    end)
    assert(type(__catalogsearchparamsNC) == "function", "CatalogSearchParams __namecall")
    _src, _line, _name, _pc, _va = debug.info(__catalogsearchparamsNC, "slna")
    assert(type(__catalogsearchparamsNC) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true and __catalogsearchparamsNC == __catalogsearchparamsIndex, "CatalogSearchParams __namecall")
    assert(getmetatable(__catalogsearchparams) == "The metatable is locked", "CatalogSearchParams Metatable Access")

    assert(Region3int16, "Missing Global Region3int16")
    assert(Region3int16.new, "Missing Global Region3int16.new")
    _src, _line, _name, _pc, _va = debug.info(Region3int16.new, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "new" and _pc == 0 and _va == true, "Global Region3int16.new Debug Info")
    local __region3int16: any = (Region3int16.new :: any)(Vector3int16.new(0, 0, 0), Vector3int16.new(1, 1, 1))
    assert(typeof(__region3int16) == "Region3int16", "Region3int16 Type")
    assert(pcall(function() return __region3int16.Min end), "[1] Region3int16 __index")
    local __region3int16Index: (...any) -> ...any
    xpcall(function() return (__region3int16 :: any).____ end, function()
        __region3int16Index = debug.info(2, "f")
    end)
    assert(type(__region3int16Index) == "function", "Region3int16 __index")
    _src, _line, _name, _pc, _va = debug.info(__region3int16Index, "slna")
    assert(type(__region3int16Index) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true, "[2] Region3int16 __index")
    local __region3int16NC: (...any) -> ...any
    xpcall(function() return (__region3int16 :: any):____() end, function()
        __region3int16NC = debug.info(2, "f")
    end)
    assert(type(__region3int16NC) == "function", "Region3int16 __namecall")
    _src, _line, _name, _pc, _va = debug.info(__region3int16NC, "slna")
    assert(type(__region3int16NC) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true and __region3int16NC == __region3int16Index, "Region3int16 __namecall")
    assert(getmetatable(__region3int16) == "The metatable is locked", "Region3int16 Metatable Access")

    assert(Faces, "Missing Global Faces")
    assert(Faces.new, "Missing Global Faces.new")
    _src, _line, _name, _pc, _va = debug.info(Faces.new, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "new" and _pc == 0 and _va == true, "Global Faces.new Debug Info")
    local __faces: any = (Faces.new :: any)()
    assert(typeof(__faces) == "Faces", "Faces Type")
    assert(pcall(function() return __faces.Top end), "[1] Faces __index")
    local __facesIndex: (...any) -> ...any
    xpcall(function() return (__faces :: any).____ end, function()
        __facesIndex = debug.info(2, "f")
    end)
    assert(type(__facesIndex) == "function", "Faces __index")
    _src, _line, _name, _pc, _va = debug.info(__facesIndex, "slna")
    assert(type(__facesIndex) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true, "[2] Faces __index")
    local __facesNC: (...any) -> ...any
    xpcall(function() return (__faces :: any):____() end, function()
        __facesNC = debug.info(2, "f")
    end)
    assert(type(__facesNC) == "function", "Faces __namecall")
    _src, _line, _name, _pc, _va = debug.info(__facesNC, "slna")
    assert(type(__facesNC) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true and __facesNC == __facesIndex, "Faces __namecall")
    assert(getmetatable(__faces) == "The metatable is locked", "Faces Metatable Access")

    assert(OverlapParams, "Missing Global OverlapParams")
    assert(OverlapParams.new, "Missing Global OverlapParams.new")
    _src, _line, _name, _pc, _va = debug.info(OverlapParams.new, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "new" and _pc == 0 and _va == true, "Global OverlapParams.new Debug Info")
    local __overlapparams: any = (OverlapParams.new :: any)()
    assert(typeof(__overlapparams) == "OverlapParams", "OverlapParams Type")
    assert(pcall(function() return __overlapparams.FilterDescendantsInstances end), "[1] OverlapParams __index")
    local __overlapparamsIndex: (...any) -> ...any
    xpcall(function() return (__overlapparams :: any).____ end, function()
        __overlapparamsIndex = debug.info(2, "f")
    end)
    assert(type(__overlapparamsIndex) == "function", "OverlapParams __index")
    _src, _line, _name, _pc, _va = debug.info(__overlapparamsIndex, "slna")
    assert(type(__overlapparamsIndex) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true, "[2] OverlapParams __index")
    local __overlapparamsNC: (...any) -> ...any
    xpcall(function() return (__overlapparams :: any):____() end, function()
        __overlapparamsNC = debug.info(2, "f")
    end)
    assert(type(__overlapparamsNC) == "function", "OverlapParams __namecall")
    _src, _line, _name, _pc, _va = debug.info(__overlapparamsNC, "slna")
    assert(type(__overlapparamsNC) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true and __overlapparamsNC ~= __overlapparamsIndex, "OverlapParams __namecall")
    assert(getmetatable(__overlapparams) == "The metatable is locked", "OverlapParams Metatable Access")

    assert(Path2DControlPoint, "Missing Global Path2DControlPoint")
    assert(Path2DControlPoint.new, "Missing Global Path2DControlPoint.new")
    _src, _line, _name, _pc, _va = debug.info(Path2DControlPoint.new, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "new" and _pc == 0 and _va == true, "Global Path2DControlPoint.new Debug Info")
    local __path2dcontrolpoint: any = (Path2DControlPoint.new :: any)()
    assert(typeof(__path2dcontrolpoint) == "Path2DControlPoint", "Path2DControlPoint Type")
    assert(pcall(function() return __path2dcontrolpoint.Position end), "[1] Path2DControlPoint __index")
    local __path2dcontrolpointIndex: (...any) -> ...any
    xpcall(function() return (__path2dcontrolpoint :: any).____ end, function()
        __path2dcontrolpointIndex = debug.info(2, "f")
    end)
    assert(type(__path2dcontrolpointIndex) == "function", "Path2DControlPoint __index")
    _src, _line, _name, _pc, _va = debug.info(__path2dcontrolpointIndex, "slna")
    assert(type(__path2dcontrolpointIndex) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true, "[2] Path2DControlPoint __index")
    local __path2dcontrolpointNC: (...any) -> ...any
    xpcall(function() return (__path2dcontrolpoint :: any):____() end, function()
        __path2dcontrolpointNC = debug.info(2, "f")
    end)
    assert(type(__path2dcontrolpointNC) == "function", "Path2DControlPoint __namecall")
    _src, _line, _name, _pc, _va = debug.info(__path2dcontrolpointNC, "slna")
    assert(type(__path2dcontrolpointNC) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true and __path2dcontrolpointNC == __path2dcontrolpointIndex, "Path2DControlPoint __namecall")
    assert(getmetatable(__path2dcontrolpoint) == "The metatable is locked", "Path2DControlPoint Metatable Access")

    assert(Region3, "Missing Global Region3")
    assert(Region3.new, "Missing Global Region3.new")
    _src, _line, _name, _pc, _va = debug.info(Region3.new, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "new" and _pc == 0 and _va == true, "Global Region3.new Debug Info")
    local __region3: any = (Region3.new :: any)(vector.zero :: any, Vector3.one)
    assert(typeof(__region3) == "Region3", "Region3 Type")
    assert(pcall(function() return __region3.Size end), "[1] Region3 __index")
    local __region3Index: (...any) -> ...any
    xpcall(function() return (__region3 :: any).____ end, function()
        __region3Index = debug.info(2, "f")
    end)
    assert(type(__region3Index) == "function", "Region3 __index")
    _src, _line, _name, _pc, _va = debug.info(__region3Index, "slna")
    assert(type(__region3Index) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true, "[2] Region3 __index")
    local __region3NC: (...any) -> ...any
    xpcall(function() return (__region3 :: any):____() end, function()
        __region3NC = debug.info(2, "f")
    end)
    assert(type(__region3NC) == "function", "Region3 __namecall")
    _src, _line, _name, _pc, _va = debug.info(__region3NC, "slna")
    assert(type(__region3NC) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true and __region3NC ~= __region3Index, "Region3 __namecall")
    assert(getmetatable(__region3) == "The metatable is locked", "Region3 Metatable Access")

    assert(ColorSequence, "Missing Global ColorSequence")
    assert(ColorSequence.new, "Missing Global ColorSequence.new")
    _src, _line, _name, _pc, _va = debug.info(ColorSequence.new, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "new" and _pc == 0 and _va == true, "Global ColorSequence.new Debug Info")
    local __colorsequence: any = (ColorSequence.new :: any)(Color3.new())
    assert(typeof(__colorsequence) == "ColorSequence", "ColorSequence Type")
    assert(pcall(function() return __colorsequence.Keypoints end), "[1] ColorSequence __index")
    local __colorsequenceIndex: (...any) -> ...any
    xpcall(function() return (__colorsequence :: any).____ end, function()
        __colorsequenceIndex = debug.info(2, "f")
    end)
    assert(type(__colorsequenceIndex) == "function", "ColorSequence __index")
    _src, _line, _name, _pc, _va = debug.info(__colorsequenceIndex, "slna")
    assert(type(__colorsequenceIndex) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true, "[2] ColorSequence __index")
    local __colorsequenceNC: (...any) -> ...any
    xpcall(function() return (__colorsequence :: any):____() end, function()
        __colorsequenceNC = debug.info(2, "f")
    end)
    assert(type(__colorsequenceNC) == "function", "ColorSequence __namecall")
    _src, _line, _name, _pc, _va = debug.info(__colorsequenceNC, "slna")
    assert(type(__colorsequenceNC) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true and __colorsequenceNC == __colorsequenceIndex, "ColorSequence __namecall")
    assert(getmetatable(__colorsequence) == "The metatable is locked", "ColorSequence Metatable Access")

    assert(RotationCurveKey, "Missing Global RotationCurveKey")
    assert(RotationCurveKey.new, "Missing Global RotationCurveKey.new")
    _src, _line, _name, _pc, _va = debug.info(RotationCurveKey.new, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "new" and _pc == 0 and _va == true, "Global RotationCurveKey.new Debug Info")
    local __rotationcurvekey: any = (RotationCurveKey.new :: any)(1, CFrame.new())
    assert(typeof(__rotationcurvekey) == "RotationCurveKey", "RotationCurveKey Type")
    assert(pcall(function() return __rotationcurvekey.Interpolation end), "[1] RotationCurveKey __index")
    local __rotationcurvekeyIndex: (...any) -> ...any
    xpcall(function() return (__rotationcurvekey :: any).____ end, function()
        __rotationcurvekeyIndex = debug.info(2, "f")
    end)
    assert(type(__rotationcurvekeyIndex) == "function", "RotationCurveKey __index")
    _src, _line, _name, _pc, _va = debug.info(__rotationcurvekeyIndex, "slna")
    assert(type(__rotationcurvekeyIndex) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true, "[2] RotationCurveKey __index")
    local __rotationcurvekeyNC: (...any) -> ...any
    xpcall(function() return (__rotationcurvekey :: any):____() end, function()
        __rotationcurvekeyNC = debug.info(2, "f")
    end)
    assert(type(__rotationcurvekeyNC) == "function", "RotationCurveKey __namecall")
    _src, _line, _name, _pc, _va = debug.info(__rotationcurvekeyNC, "slna")
    assert(type(__rotationcurvekeyNC) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true and __rotationcurvekeyNC == __rotationcurvekeyIndex, "RotationCurveKey __namecall")
    assert(getmetatable(__rotationcurvekey) == "The metatable is locked", "RotationCurveKey Metatable Access")

    assert(buffer, "Missing Global buffer")
    assert(buffer.readf64, "Missing Global buffer.readf64")
    _src, _line, _name, _pc, _va = debug.info(buffer.readf64, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "readf64" and _pc == 0 and _va == true, "Global buffer.readf64 Debug Info")
    assert(pcall(buffer.readf64 :: any, buffer.create(16), 0), "buffer.readf64")
    assert(buffer.readu32, "Missing Global buffer.readu32")
    _src, _line, _name, _pc, _va = debug.info(buffer.readu32, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "readu32" and _pc == 0 and _va == true, "Global buffer.readu32 Debug Info")
    assert(pcall(buffer.readu32 :: any, buffer.create(16), 0), "buffer.readu32")
    assert(buffer.tostring, "Missing Global buffer.tostring")
    _src, _line, _name, _pc, _va = debug.info(buffer.tostring, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "tostring" and _pc == 0 and _va == true, "Global buffer.tostring Debug Info")
    assert(pcall(buffer.tostring :: any, buffer.create(16)), "buffer.tostring")
    assert(buffer.readi8, "Missing Global buffer.readi8")
    _src, _line, _name, _pc, _va = debug.info(buffer.readi8, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "readi8" and _pc == 0 and _va == true, "Global buffer.readi8 Debug Info")
    assert(pcall(buffer.readi8 :: any, buffer.create(16), 0), "buffer.readi8")
    assert(buffer.readu16, "Missing Global buffer.readu16")
    _src, _line, _name, _pc, _va = debug.info(buffer.readu16, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "readu16" and _pc == 0 and _va == true, "Global buffer.readu16 Debug Info")
    assert(pcall(buffer.readu16 :: any, buffer.create(16), 0), "buffer.readu16")
    assert(buffer.copy, "Missing Global buffer.copy")
    _src, _line, _name, _pc, _va = debug.info(buffer.copy, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "copy" and _pc == 0 and _va == true, "Global buffer.copy Debug Info")
    assert(pcall(buffer.copy :: any, buffer.create(16), 0, buffer.fromstring("Hello World!")), "buffer.copy")
    assert(buffer.readu8, "Missing Global buffer.readu8")
    _src, _line, _name, _pc, _va = debug.info(buffer.readu8, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "readu8" and _pc == 0 and _va == true, "Global buffer.readu8 Debug Info")
    assert(pcall(buffer.readu8 :: any, buffer.create(16), 0), "buffer.readu8")
    assert(buffer.writestring, "Missing Global buffer.writestring")
    _src, _line, _name, _pc, _va = debug.info(buffer.writestring, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "writestring" and _pc == 0 and _va == true, "Global buffer.writestring Debug Info")
    assert(pcall(buffer.writestring :: any, buffer.create(16), 1, ""), "buffer.writestring")
    assert(buffer.writei16, "Missing Global buffer.writei16")
    _src, _line, _name, _pc, _va = debug.info(buffer.writei16, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "writei16" and _pc == 0 and _va == true, "Global buffer.writei16 Debug Info")
    assert(pcall(buffer.writei16 :: any, buffer.create(16), 0, 1), "buffer.writei16")
    assert(buffer.fill, "Missing Global buffer.fill")
    _src, _line, _name, _pc, _va = debug.info(buffer.fill, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "fill" and _pc == 0 and _va == true, "Global buffer.fill Debug Info")
    assert(pcall(buffer.fill :: any, buffer.create(16), 2, 0xFF, 4), "buffer.fill")
    assert(buffer.fromstring, "Missing Global buffer.fromstring")
    _src, _line, _name, _pc, _va = debug.info(buffer.fromstring, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "fromstring" and _pc == 0 and _va == true, "Global buffer.fromstring Debug Info")
    assert(pcall(buffer.fromstring :: any, "Hello World!"), "buffer.fromstring")
    assert(buffer.writebits, "Missing Global buffer.writebits")
    _src, _line, _name, _pc, _va = debug.info(buffer.writebits, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "writebits" and _pc == 0 and _va == true, "Global buffer.writebits Debug Info")
    assert(pcall(buffer.writebits :: any, buffer.create(16), 1, 1, 1), "buffer.writebits")
    assert(buffer.readi32, "Missing Global buffer.readi32")
    _src, _line, _name, _pc, _va = debug.info(buffer.readi32, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "readi32" and _pc == 0 and _va == true, "Global buffer.readi32 Debug Info")
    assert(pcall(buffer.readi32 :: any, buffer.create(16), 0), "buffer.readi32")
    assert(buffer.writei32, "Missing Global buffer.writei32")
    _src, _line, _name, _pc, _va = debug.info(buffer.writei32, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "writei32" and _pc == 0 and _va == true, "Global buffer.writei32 Debug Info")
    assert(pcall(buffer.writei32 :: any, buffer.create(16), 0, 1), "buffer.writei32")
    assert(buffer.writef32, "Missing Global buffer.writef32")
    _src, _line, _name, _pc, _va = debug.info(buffer.writef32, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "writef32" and _pc == 0 and _va == true, "Global buffer.writef32 Debug Info")
    assert(pcall(buffer.writef32 :: any, buffer.create(16), 0, 1), "buffer.writef32")
    assert(buffer.writeu8, "Missing Global buffer.writeu8")
    _src, _line, _name, _pc, _va = debug.info(buffer.writeu8, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "writeu8" and _pc == 0 and _va == true, "Global buffer.writeu8 Debug Info")
    assert(pcall(buffer.writeu8 :: any, buffer.create(16), 0, 1), "buffer.writeu8")
    assert(buffer.create, "Missing Global buffer.create")
    _src, _line, _name, _pc, _va = debug.info(buffer.create, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "create" and _pc == 0 and _va == true, "Global buffer.create Debug Info")
    assert(pcall(buffer.create :: any, 16), "buffer.create")
    assert(buffer.writeu32, "Missing Global buffer.writeu32")
    _src, _line, _name, _pc, _va = debug.info(buffer.writeu32, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "writeu32" and _pc == 0 and _va == true, "Global buffer.writeu32 Debug Info")
    assert(pcall(buffer.writeu32 :: any, buffer.create(16), 0, 1), "buffer.writeu32")
    assert(buffer.writeu16, "Missing Global buffer.writeu16")
    _src, _line, _name, _pc, _va = debug.info(buffer.writeu16, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "writeu16" and _pc == 0 and _va == true, "Global buffer.writeu16 Debug Info")
    assert(pcall(buffer.writeu16 :: any, buffer.create(16), 0, 1), "buffer.writeu16")
    assert(buffer.readbits, "Missing Global buffer.readbits")
    _src, _line, _name, _pc, _va = debug.info(buffer.readbits, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "readbits" and _pc == 0 and _va == true, "Global buffer.readbits Debug Info")
    assert(pcall(buffer.readbits :: any, buffer.create(16), 1, 1), "buffer.readbits")
    assert(buffer.readi16, "Missing Global buffer.readi16")
    _src, _line, _name, _pc, _va = debug.info(buffer.readi16, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "readi16" and _pc == 0 and _va == true, "Global buffer.readi16 Debug Info")
    assert(pcall(buffer.readi16 :: any, buffer.create(16), 0), "buffer.readi16")
    assert(buffer.writef64, "Missing Global buffer.writef64")
    _src, _line, _name, _pc, _va = debug.info(buffer.writef64, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "writef64" and _pc == 0 and _va == true, "Global buffer.writef64 Debug Info")
    assert(pcall(buffer.writef64 :: any, buffer.create(16), 0, 1), "buffer.writef64")
    assert(buffer.len, "Missing Global buffer.len")
    _src, _line, _name, _pc, _va = debug.info(buffer.len, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "len" and _pc == 0 and _va == true, "Global buffer.len Debug Info")
    assert(pcall(buffer.len :: any, buffer.create(16)), "buffer.len")
    assert(buffer.writei8, "Missing Global buffer.writei8")
    _src, _line, _name, _pc, _va = debug.info(buffer.writei8, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "writei8" and _pc == 0 and _va == true, "Global buffer.writei8 Debug Info")
    assert(pcall(buffer.writei8 :: any, buffer.create(16), 0, 1), "buffer.writei8")
    assert(buffer.readstring, "Missing Global buffer.readstring")
    _src, _line, _name, _pc, _va = debug.info(buffer.readstring, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "readstring" and _pc == 0 and _va == true, "Global buffer.readstring Debug Info")
    assert(pcall(buffer.readstring :: any, buffer.create(16), 1, 1), "buffer.readstring")
    assert(buffer.readf32, "Missing Global buffer.readf32")
    _src, _line, _name, _pc, _va = debug.info(buffer.readf32, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "readf32" and _pc == 0 and _va == true, "Global buffer.readf32 Debug Info")
    assert(pcall(buffer.readf32 :: any, buffer.create(16), 0), "buffer.readf32")
    local __buffer: any = (buffer.create :: any)(16)
    assert(typeof(__buffer) == "buffer", "buffer Type")

    assert(Vector3, "Missing Global Vector3")
    assert(Vector3.new, "Missing Global Vector3.new")
    _src, _line, _name, _pc, _va = debug.info(Vector3.new, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "new" and _pc == 0 and _va == true, "Global Vector3.new Debug Info")
    __vector3 = (Vector3.new :: any)()
    assert(typeof(__vector3) == "Vector3", "Vector3 Type")
    assert(pcall(function() return __vector3.X end), "[1] Vector3 __index")
    local __vector3Index: (...any) -> ...any
    xpcall(function() return (__vector3 :: any).____ end, function()
        __vector3Index = debug.info(2, "f")
    end)
    assert(type(__vector3Index) == "function", "Vector3 __index")
    _src, _line, _name, _pc, _va = debug.info(__vector3Index, "slna")
    assert(type(__vector3Index) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true, "[2] Vector3 __index")
    local __vector3NC: (...any) -> ...any
    xpcall(function() return (__vector3 :: any):____() end, function()
        __vector3NC = debug.info(2, "f")
    end)
    assert(type(__vector3NC) == "function", "Vector3 __namecall")
    _src, _line, _name, _pc, _va = debug.info(__vector3NC, "slna")
    assert(type(__vector3NC) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true and __vector3NC ~= __vector3Index, "Vector3 __namecall")
    assert(getmetatable(__vector3) == "The metatable is locked", "Vector3 Metatable Access")

    assert(Vector2int16, "Missing Global Vector2int16")
    assert(Vector2int16.new, "Missing Global Vector2int16.new")
    _src, _line, _name, _pc, _va = debug.info(Vector2int16.new, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "new" and _pc == 0 and _va == true, "Global Vector2int16.new Debug Info")
    local __vector2int16: any = (Vector2int16.new :: any)()
    assert(typeof(__vector2int16) == "Vector2int16", "Vector2int16 Type")
    assert(pcall(function() return __vector2int16.X end), "[1] Vector2int16 __index")
    local __vector2int16Index: (...any) -> ...any
    xpcall(function() return (__vector2int16 :: any).____ end, function()
        __vector2int16Index = debug.info(2, "f")
    end)
    assert(type(__vector2int16Index) == "function", "Vector2int16 __index")
    _src, _line, _name, _pc, _va = debug.info(__vector2int16Index, "slna")
    assert(type(__vector2int16Index) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true, "[2] Vector2int16 __index")
    local __vector2int16NC: (...any) -> ...any
    xpcall(function() return (__vector2int16 :: any):____() end, function()
        __vector2int16NC = debug.info(2, "f")
    end)
    assert(type(__vector2int16NC) == "function", "Vector2int16 __namecall")
    _src, _line, _name, _pc, _va = debug.info(__vector2int16NC, "slna")
    assert(type(__vector2int16NC) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true and __vector2int16NC == __vector2int16Index, "Vector2int16 __namecall")
    assert(getmetatable(__vector2int16) == "The metatable is locked", "Vector2int16 Metatable Access")

    assert(Random, "Missing Global Random")
    assert(Random.new, "Missing Global Random.new")
    _src, _line, _name, _pc, _va = debug.info(Random.new, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "new" and _pc == 0 and _va == true, "Global Random.new Debug Info")
    __random = Random.new(438)
    assert(typeof(__random) == "Random", "Random Type")
    assert(pcall(function() return __random.NextNumber(__random) end), "[1] Random __index")
    local __randomIndex: (...any) -> ...any
    xpcall(function() return (__random :: any).____ end, function()
        __randomIndex = debug.info(2, "f")
    end)
    assert(type(__randomIndex) == "function", "Random __index")
    _src, _line, _name, _pc, _va = debug.info(__randomIndex, "slna")
    assert(type(__randomIndex) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true, "[2] Random __index")
    xpcall(function() return (__random :: any):____() end, function()
        __randomNC = debug.info(2, "f")
    end)
    assert(type(__randomNC) == "function", "Random __namecall")
    _src, _line, _name, _pc, _va = debug.info(__randomNC, "slna")
    assert(type(__randomNC) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true and __randomNC ~= __randomIndex, "Random __namecall")
    assert(getmetatable(__random) == "The metatable is locked", "Random Metatable Access")

    assert(Rect, "Missing Global Rect")
    assert(Rect.new, "Missing Global Rect.new")
    _src, _line, _name, _pc, _va = debug.info(Rect.new, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "new" and _pc == 0 and _va == true, "Global Rect.new Debug Info")
    local __rect: any = (Rect.new :: any)()
    assert(typeof(__rect) == "Rect", "Rect Type")
    assert(pcall(function() return __rect.Width end), "[1] Rect __index")
    local __rectIndex: (...any) -> ...any
    xpcall(function() return (__rect :: any).____ end, function()
        __rectIndex = debug.info(2, "f")
    end)
    assert(type(__rectIndex) == "function", "Rect __index")
    _src, _line, _name, _pc, _va = debug.info(__rectIndex, "slna")
    assert(type(__rectIndex) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true, "[2] Rect __index")
    local __rectNC: (...any) -> ...any
    xpcall(function() return (__rect :: any):____() end, function()
        __rectNC = debug.info(2, "f")
    end)
    assert(type(__rectNC) == "function", "Rect __namecall")
    _src, _line, _name, _pc, _va = debug.info(__rectNC, "slna")
    assert(type(__rectNC) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true and __rectNC == __rectIndex, "Rect __namecall")
    assert(getmetatable(__rect) == "The metatable is locked", "Rect Metatable Access")

    assert(NumberRange, "Missing Global NumberRange")
    assert(NumberRange.new, "Missing Global NumberRange.new")
    _src, _line, _name, _pc, _va = debug.info(NumberRange.new, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "new" and _pc == 0 and _va == true, "Global NumberRange.new Debug Info")
    local __numberrange: any = (NumberRange.new :: any)(1)
    assert(typeof(__numberrange) == "NumberRange", "NumberRange Type")
    assert(pcall(function() return __numberrange.Max end), "[1] NumberRange __index")
    local __numberrangeIndex: (...any) -> ...any
    xpcall(function() return (__numberrange :: any).____ end, function()
        __numberrangeIndex = debug.info(2, "f")
    end)
    assert(type(__numberrangeIndex) == "function", "NumberRange __index")
    _src, _line, _name, _pc, _va = debug.info(__numberrangeIndex, "slna")
    assert(type(__numberrangeIndex) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true, "[2] NumberRange __index")
    local __numberrangeNC: (...any) -> ...any
    xpcall(function() return (__numberrange :: any):____() end, function()
        __numberrangeNC = debug.info(2, "f")
    end)
    assert(type(__numberrangeNC) == "function", "NumberRange __namecall")
    _src, _line, _name, _pc, _va = debug.info(__numberrangeNC, "slna")
    assert(type(__numberrangeNC) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true and __numberrangeNC == __numberrangeIndex, "NumberRange __namecall")
    assert(getmetatable(__numberrange) == "The metatable is locked", "NumberRange Metatable Access")

    assert(FloatCurveKey, "Missing Global FloatCurveKey")
    assert(FloatCurveKey.new, "Missing Global FloatCurveKey.new")
    _src, _line, _name, _pc, _va = debug.info(FloatCurveKey.new, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "new" and _pc == 0 and _va == true, "Global FloatCurveKey.new Debug Info")
    local __floatcurvekey: any = (FloatCurveKey.new :: any)(1, 1, Enum.KeyInterpolationMode.Linear)
    assert(typeof(__floatcurvekey) == "FloatCurveKey", "FloatCurveKey Type")
    assert(pcall(function() return __floatcurvekey.Interpolation end), "[1] FloatCurveKey __index")
    local __floatcurvekeyIndex: (...any) -> ...any
    xpcall(function() return (__floatcurvekey :: any).____ end, function()
        __floatcurvekeyIndex = debug.info(2, "f")
    end)
    assert(type(__floatcurvekeyIndex) == "function", "FloatCurveKey __index")
    _src, _line, _name, _pc, _va = debug.info(__floatcurvekeyIndex, "slna")
    assert(type(__floatcurvekeyIndex) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true, "[2] FloatCurveKey __index")
    local __floatcurvekeyNC: (...any) -> ...any
    xpcall(function() return (__floatcurvekey :: any):____() end, function()
        __floatcurvekeyNC = debug.info(2, "f")
    end)
    assert(type(__floatcurvekeyNC) == "function", "FloatCurveKey __namecall")
    _src, _line, _name, _pc, _va = debug.info(__floatcurvekeyNC, "slna")
    assert(type(__floatcurvekeyNC) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true and __floatcurvekeyNC == __floatcurvekeyIndex, "FloatCurveKey __namecall")
    assert(getmetatable(__floatcurvekey) == "The metatable is locked", "FloatCurveKey Metatable Access")

    assert(PhysicalProperties, "Missing Global PhysicalProperties")
    assert(PhysicalProperties.new, "Missing Global PhysicalProperties.new")
    _src, _line, _name, _pc, _va = debug.info(PhysicalProperties.new, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "newPhysicalPropertiesWithClampedMsgClosure" and _pc == 0 and _va == true, "Global PhysicalProperties.new Debug Info")
    local __physicalproperties: any = (PhysicalProperties.new :: any)(Enum.Material.Plastic)
    assert(typeof(__physicalproperties) == "PhysicalProperties", "PhysicalProperties Type")
    assert(pcall(function() return __physicalproperties.Density end), "[1] PhysicalProperties __index")
    local __physicalpropertiesIndex: (...any) -> ...any
    xpcall(function() return (__physicalproperties :: any).____ end, function()
        __physicalpropertiesIndex = debug.info(2, "f")
    end)
    assert(type(__physicalpropertiesIndex) == "function", "PhysicalProperties __index")
    _src, _line, _name, _pc, _va = debug.info(__physicalpropertiesIndex, "slna")
    assert(type(__physicalpropertiesIndex) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true, "[2] PhysicalProperties __index")
    local __physicalpropertiesNC: (...any) -> ...any
    xpcall(function() return (__physicalproperties :: any):____() end, function()
        __physicalpropertiesNC = debug.info(2, "f")
    end)
    assert(type(__physicalpropertiesNC) == "function", "PhysicalProperties __namecall")
    _src, _line, _name, _pc, _va = debug.info(__physicalpropertiesNC, "slna")
    assert(type(__physicalpropertiesNC) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true and __physicalpropertiesNC == __physicalpropertiesIndex, "PhysicalProperties __namecall")
    assert(getmetatable(__physicalproperties) == "The metatable is locked", "PhysicalProperties Metatable Access")

    assert(SharedTable, "Missing Global SharedTable")
    assert(SharedTable.new, "Missing Global SharedTable.new")
    _src, _line, _name, _pc, _va = debug.info(SharedTable.new, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "new" and _pc == 0 and _va == true, "Global SharedTable.new Debug Info")
    local __sharedtable: any = (SharedTable.new :: any)()
    assert(typeof(__sharedtable) == "SharedTable", "SharedTable Type")
    assert(pcall(function() return __sharedtable.clear end), "[1] SharedTable __index")
    assert(getmetatable(__sharedtable) == "The metatable is locked", "SharedTable Metatable Access")

    assert(Instance, "Missing Global Instance")
    assert(Instance.new, "Missing Global Instance.new")
    _src, _line, _name, _pc, _va = debug.info(Instance.new, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "new" and _pc == 0 and _va == true, "Global Instance.new Debug Info")
    __instance = Instance.new("ObjectValue")
    assert(typeof(__instance) == "Instance", "Instance Type")
    assert(pcall(function() return __instance.Value end), "[1] Instance __index")
    xpcall(function() return (__instance :: any).____ end, function()
        __instanceIndex = debug.info(2, "f")
    end)
    assert(type(__instanceIndex) == "function", "Instance __index")
    _src, _line, _name, _pc, _va = debug.info(__instanceIndex, "slna")
    assert(type(__instanceIndex) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true, "[2] Instance __index")
    xpcall(function() return (__instance :: any):____() end, function()
        __instanceNC = debug.info(2, "f")
    end)
    assert(type(__instanceNC) == "function", "Instance __namecall")
    _src, _line, _name, _pc, _va = debug.info(__instanceNC, "slna")
    assert(type(__instanceNC) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true and __instanceNC ~= __instanceIndex, "Instance __namecall")
    assert(getmetatable(__instance) == "The metatable is locked", "Instance Metatable Access")

    assert(ValueCurveKey, "Missing Global ValueCurveKey")
    assert(ValueCurveKey.new, "Missing Global ValueCurveKey.new")
    _src, _line, _name, _pc, _va = debug.info(ValueCurveKey.new, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "new" and _pc == 0 and _va == true, "Global ValueCurveKey.new Debug Info")
    local __valuecurvekey: any = (ValueCurveKey.new :: any)(1, 1)
    assert(typeof(__valuecurvekey) == "ValueCurveKey", "ValueCurveKey Type")
    assert(pcall(function() return __valuecurvekey.Interpolation end), "[1] ValueCurveKey __index")
    local __valuecurvekeyIndex: (...any) -> ...any
    xpcall(function() return (__valuecurvekey :: any).____ end, function()
        __valuecurvekeyIndex = debug.info(2, "f")
    end)
    assert(type(__valuecurvekeyIndex) == "function", "ValueCurveKey __index")
    _src, _line, _name, _pc, _va = debug.info(__valuecurvekeyIndex, "slna")
    assert(type(__valuecurvekeyIndex) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true, "[2] ValueCurveKey __index")
    local __valuecurvekeyNC: (...any) -> ...any
    xpcall(function() return (__valuecurvekey :: any):____() end, function()
        __valuecurvekeyNC = debug.info(2, "f")
    end)
    assert(type(__valuecurvekeyNC) == "function", "ValueCurveKey __namecall")
    _src, _line, _name, _pc, _va = debug.info(__valuecurvekeyNC, "slna")
    assert(type(__valuecurvekeyNC) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true and __valuecurvekeyNC == __valuecurvekeyIndex, "ValueCurveKey __namecall")
    assert(getmetatable(__valuecurvekey) == "The metatable is locked", "ValueCurveKey Metatable Access")

    assert(UDim2, "Missing Global UDim2")
    assert(UDim2.fromScale, "Missing Global UDim2.fromScale")
    _src, _line, _name, _pc, _va = debug.info(UDim2.fromScale, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "fromScale" and _pc == 0 and _va == true, "Global UDim2.fromScale Debug Info")
    assert(pcall(UDim2.fromScale :: any, 0, 0), "UDim2.fromScale")
    assert(UDim2.fromOffset, "Missing Global UDim2.fromOffset")
    _src, _line, _name, _pc, _va = debug.info(UDim2.fromOffset, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "fromOffset" and _pc == 0 and _va == true, "Global UDim2.fromOffset Debug Info")
    assert(pcall(UDim2.fromOffset :: any, 0, 0), "UDim2.fromOffset")
    assert(UDim2.new, "Missing Global UDim2.new")
    _src, _line, _name, _pc, _va = debug.info(UDim2.new, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "new" and _pc == 0 and _va == true, "Global UDim2.new Debug Info")
    local __udim2: any = (UDim2.new :: any)()
    assert(typeof(__udim2) == "UDim2", "UDim2 Type")
    assert(pcall(function() return __udim2.X end), "[1] UDim2 __index")
    local __udim2Index: (...any) -> ...any
    xpcall(function() return (__udim2 :: any).____ end, function()
        __udim2Index = debug.info(2, "f")
    end)
    assert(type(__udim2Index) == "function", "UDim2 __index")
    _src, _line, _name, _pc, _va = debug.info(__udim2Index, "slna")
    assert(type(__udim2Index) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true, "[2] UDim2 __index")
    local __udim2NC: (...any) -> ...any
    xpcall(function() return (__udim2 :: any):____() end, function()
        __udim2NC = debug.info(2, "f")
    end)
    assert(type(__udim2NC) == "function", "UDim2 __namecall")
    _src, _line, _name, _pc, _va = debug.info(__udim2NC, "slna")
    assert(type(__udim2NC) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true and __udim2NC ~= __udim2Index, "UDim2 __namecall")
    assert(getmetatable(__udim2) == "The metatable is locked", "UDim2 Metatable Access")

    assert(SecurityCapabilities, "Missing Global SecurityCapabilities")
    assert(SecurityCapabilities.new, "Missing Global SecurityCapabilities.new")
    _src, _line, _name, _pc, _va = debug.info(SecurityCapabilities.new, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "new" and _pc == 0 and _va == true, "Global SecurityCapabilities.new Debug Info")
    assert(pcall(SecurityCapabilities.new :: any), "SecurityCapabilities.new")
    assert(SecurityCapabilities.fromCurrent, "Missing Global SecurityCapabilities.fromCurrent")
    _src, _line, _name, _pc, _va = debug.info(SecurityCapabilities.fromCurrent, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "fromCurrent" and _pc == 0 and _va == true, "Global SecurityCapabilities.fromCurrent Debug Info")
    local __securitycapabilities: any = (SecurityCapabilities.fromCurrent :: any)()
    assert(typeof(__securitycapabilities) == "SecurityCapabilities", "SecurityCapabilities Type")
    assert(pcall(function() return __securitycapabilities.Add end), "[1] SecurityCapabilities __index")
    local __securitycapabilitiesIndex: (...any) -> ...any
    xpcall(function() return (__securitycapabilities :: any).____ end, function()
        __securitycapabilitiesIndex = debug.info(2, "f")
    end)
    assert(type(__securitycapabilitiesIndex) == "function", "SecurityCapabilities __index")
    _src, _line, _name, _pc, _va = debug.info(__securitycapabilitiesIndex, "slna")
    assert(type(__securitycapabilitiesIndex) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true, "[2] SecurityCapabilities __index")
    local __securitycapabilitiesNC: (...any) -> ...any
    xpcall(function() return (__securitycapabilities :: any):____() end, function()
        __securitycapabilitiesNC = debug.info(2, "f")
    end)
    assert(type(__securitycapabilitiesNC) == "function", "SecurityCapabilities __namecall")
    _src, _line, _name, _pc, _va = debug.info(__securitycapabilitiesNC, "slna")
    assert(type(__securitycapabilitiesNC) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true and __securitycapabilitiesNC ~= __securitycapabilitiesIndex, "SecurityCapabilities __namecall")
    assert(getmetatable(__securitycapabilities) == "The metatable is locked", "SecurityCapabilities Metatable Access")

    assert(Ray, "Missing Global Ray")
    assert(Ray.new, "Missing Global Ray.new")
    _src, _line, _name, _pc, _va = debug.info(Ray.new, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "new" and _pc == 0 and _va == true, "Global Ray.new Debug Info")
    local __ray: any = (Ray.new :: any)(vector.zero :: any, Vector3.one)
    assert(typeof(__ray) == "Ray", "Ray Type")
    assert(pcall(function() return __ray.Unit end), "[1] Ray __index")
    local __rayIndex: (...any) -> ...any
    xpcall(function() return (__ray :: any).____ end, function()
        __rayIndex = debug.info(2, "f")
    end)
    assert(type(__rayIndex) == "function", "Ray __index")
    _src, _line, _name, _pc, _va = debug.info(__rayIndex, "slna")
    assert(type(__rayIndex) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true, "[2] Ray __index")
    local __rayNC: (...any) -> ...any
    xpcall(function() return (__ray :: any):____() end, function()
        __rayNC = debug.info(2, "f")
    end)
    assert(type(__rayNC) == "function", "Ray __namecall")
    _src, _line, _name, _pc, _va = debug.info(__rayNC, "slna")
    assert(type(__rayNC) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true and __rayNC ~= __rayIndex, "Ray __namecall")
    assert(getmetatable(__ray) == "The metatable is locked", "Ray Metatable Access")

    assert(Font, "Missing Global Font")
    assert(Font.fromEnum, "Missing Global Font.fromEnum")
    _src, _line, _name, _pc, _va = debug.info(Font.fromEnum, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "fromEnum" and _pc == 0 and _va == true, "Global Font.fromEnum Debug Info")
    assert(pcall(Font.fromEnum :: any, Enum.Font.Code), "Font.fromEnum")
    assert(Font.fromId, "Missing Global Font.fromId")
    _src, _line, _name, _pc, _va = debug.info(Font.fromId, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "fromId" and _pc == 0 and _va == true, "Global Font.fromId Debug Info")
    assert(pcall(Font.fromId :: any, 1), "Font.fromId")
    assert(Font.fromName, "Missing Global Font.fromName")
    _src, _line, _name, _pc, _va = debug.info(Font.fromName, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "fromName" and _pc == 0 and _va == true, "Global Font.fromName Debug Info")
    assert(pcall(Font.fromName :: any, "-"), "Font.fromName")
    assert(Font.new, "Missing Global Font.new")
    _src, _line, _name, _pc, _va = debug.info(Font.new, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "new" and _pc == 0 and _va == true, "Global Font.new Debug Info")
    local __font: any = (Font.new :: any)("")
    assert(typeof(__font) == "Font", "Font Type")
    assert(pcall(function() return __font.Weight end), "[1] Font __index")
    local __fontIndex: (...any) -> ...any
    xpcall(function() return (__font :: any).____ end, function()
        __fontIndex = debug.info(2, "f")
    end)
    assert(type(__fontIndex) == "function", "Font __index")
    _src, _line, _name, _pc, _va = debug.info(__fontIndex, "slna")
    assert(type(__fontIndex) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true, "[2] Font __index")
    local __fontNC: (...any) -> ...any
    xpcall(function() return (__font :: any):____() end, function()
        __fontNC = debug.info(2, "f")
    end)
    assert(type(__fontNC) == "function", "Font __namecall")
    _src, _line, _name, _pc, _va = debug.info(__fontNC, "slna")
    assert(type(__fontNC) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true and __fontNC == __fontIndex, "Font __namecall")
    assert(getmetatable(__font) == "The metatable is locked", "Font Metatable Access")

    assert(BrickColor, "Missing Global BrickColor")
    assert(BrickColor.Blue, "Missing Global BrickColor.Blue")
    _src, _line, _name, _pc, _va = debug.info(BrickColor.Blue, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "Blue" and _pc == 0 and _va == true, "Global BrickColor.Blue Debug Info")
    assert(pcall(BrickColor.Blue :: any), "BrickColor.Blue")
    assert(BrickColor.Yellow, "Missing Global BrickColor.Yellow")
    _src, _line, _name, _pc, _va = debug.info(BrickColor.Yellow, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "Yellow" and _pc == 0 and _va == true, "Global BrickColor.Yellow Debug Info")
    assert(pcall(BrickColor.Yellow :: any), "BrickColor.Yellow")
    assert(BrickColor.White, "Missing Global BrickColor.White")
    _src, _line, _name, _pc, _va = debug.info(BrickColor.White, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "White" and _pc == 0 and _va == true, "Global BrickColor.White Debug Info")
    assert(pcall(BrickColor.White :: any), "BrickColor.White")
    assert(BrickColor.Red, "Missing Global BrickColor.Red")
    _src, _line, _name, _pc, _va = debug.info(BrickColor.Red, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "Red" and _pc == 0 and _va == true, "Global BrickColor.Red Debug Info")
    assert(pcall(BrickColor.Red :: any), "BrickColor.Red")
    assert(BrickColor.palette, "Missing Global BrickColor.palette")
    _src, _line, _name, _pc, _va = debug.info(BrickColor.palette, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "palette" and _pc == 0 and _va == true, "Global BrickColor.palette Debug Info")
    assert(pcall(BrickColor.palette :: any, 1), "BrickColor.palette")
    assert(BrickColor.random, "Missing Global BrickColor.random")
    _src, _line, _name, _pc, _va = debug.info(BrickColor.random, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "random" and _pc == 0 and _va == true, "Global BrickColor.random Debug Info")
    assert(pcall(BrickColor.random :: any), "BrickColor.random")
    assert(BrickColor.Black, "Missing Global BrickColor.Black")
    _src, _line, _name, _pc, _va = debug.info(BrickColor.Black, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "Black" and _pc == 0 and _va == true, "Global BrickColor.Black Debug Info")
    assert(pcall(BrickColor.Black :: any), "BrickColor.Black")
    assert(BrickColor.Green, "Missing Global BrickColor.Green")
    _src, _line, _name, _pc, _va = debug.info(BrickColor.Green, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "Green" and _pc == 0 and _va == true, "Global BrickColor.Green Debug Info")
    assert(pcall(BrickColor.Green :: any), "BrickColor.Green")
    assert(BrickColor.new, "Missing Global BrickColor.new")
    _src, _line, _name, _pc, _va = debug.info(BrickColor.new, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "new" and _pc == 0 and _va == true, "Global BrickColor.new Debug Info")
    assert(pcall(BrickColor.new :: any, 1), "BrickColor.new")
    assert(BrickColor.DarkGray, "Missing Global BrickColor.DarkGray")
    _src, _line, _name, _pc, _va = debug.info(BrickColor.DarkGray, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "DarkGray" and _pc == 0 and _va == true, "Global BrickColor.DarkGray Debug Info")
    assert(pcall(BrickColor.DarkGray :: any), "BrickColor.DarkGray")
    assert(BrickColor.Random, "Missing Global BrickColor.Random")
    _src, _line, _name, _pc, _va = debug.info(BrickColor.Random, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "Random" and _pc == 0 and _va == true, "Global BrickColor.Random Debug Info")
    assert(pcall(BrickColor.Random :: any), "BrickColor.Random")
    assert(BrickColor.Gray, "Missing Global BrickColor.Gray")
    _src, _line, _name, _pc, _va = debug.info(BrickColor.Gray, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "Gray" and _pc == 0 and _va == true, "Global BrickColor.Gray Debug Info")
    local __brickcolor: any = (BrickColor.Gray :: any)()
    assert(typeof(__brickcolor) == "BrickColor", "BrickColor Type")
    assert(pcall(function() return __brickcolor.Name end), "[1] BrickColor __index")
    local __brickcolorIndex: (...any) -> ...any
    xpcall(function() return (__brickcolor :: any).____ end, function()
        __brickcolorIndex = debug.info(2, "f")
    end)
    assert(type(__brickcolorIndex) == "function", "BrickColor __index")
    _src, _line, _name, _pc, _va = debug.info(__brickcolorIndex, "slna")
    assert(type(__brickcolorIndex) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true, "[2] BrickColor __index")
    local __brickcolorNC: (...any) -> ...any
    xpcall(function() return (__brickcolor :: any):____() end, function()
        __brickcolorNC = debug.info(2, "f")
    end)
    assert(type(__brickcolorNC) == "function", "BrickColor __namecall")
    _src, _line, _name, _pc, _va = debug.info(__brickcolorNC, "slna")
    assert(type(__brickcolorNC) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true and __brickcolorNC == __brickcolorIndex, "BrickColor __namecall")
    assert(getmetatable(__brickcolor) == "The metatable is locked", "BrickColor Metatable Access")

    assert(Vector2, "Missing Global Vector2")
    assert(Vector2.new, "Missing Global Vector2.new")
    _src, _line, _name, _pc, _va = debug.info(Vector2.new, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "new" and _pc == 0 and _va == true, "Global Vector2.new Debug Info")
    local __vector2: any = (Vector2.new :: any)()
    assert(typeof(__vector2) == "Vector2", "Vector2 Type")
    assert(pcall(function() return __vector2.X end), "[1] Vector2 __index")
    local __vector2Index: (...any) -> ...any
    xpcall(function() return (__vector2 :: any).____ end, function()
        __vector2Index = debug.info(2, "f")
    end)
    assert(type(__vector2Index) == "function", "Vector2 __index")
    _src, _line, _name, _pc, _va = debug.info(__vector2Index, "slna")
    assert(type(__vector2Index) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true, "[2] Vector2 __index")
    local __vector2NC: (...any) -> ...any
    xpcall(function() return (__vector2 :: any):____() end, function()
        __vector2NC = debug.info(2, "f")
    end)
    assert(type(__vector2NC) == "function", "Vector2 __namecall")
    _src, _line, _name, _pc, _va = debug.info(__vector2NC, "slna")
    assert(type(__vector2NC) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true and __vector2NC ~= __vector2Index, "Vector2 __namecall")
    assert(getmetatable(__vector2) == "The metatable is locked", "Vector2 Metatable Access")

    assert(RaycastParams, "Missing Global RaycastParams")
    assert(RaycastParams.new, "Missing Global RaycastParams.new")
    _src, _line, _name, _pc, _va = debug.info(RaycastParams.new, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "new" and _pc == 0 and _va == true, "Global RaycastParams.new Debug Info")
    local __raycastparams: any = (RaycastParams.new :: any)()
    assert(typeof(__raycastparams) == "RaycastParams", "RaycastParams Type")
    assert(pcall(function() return __raycastparams.FilterDescendantsInstances end), "[1] RaycastParams __index")
    local __raycastparamsIndex: (...any) -> ...any
    xpcall(function() return (__raycastparams :: any).____ end, function()
        __raycastparamsIndex = debug.info(2, "f")
    end)
    assert(type(__raycastparamsIndex) == "function", "RaycastParams __index")
    _src, _line, _name, _pc, _va = debug.info(__raycastparamsIndex, "slna")
    assert(type(__raycastparamsIndex) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true, "[2] RaycastParams __index")
    local __raycastparamsNC: (...any) -> ...any
    xpcall(function() return (__raycastparams :: any):____() end, function()
        __raycastparamsNC = debug.info(2, "f")
    end)
    assert(type(__raycastparamsNC) == "function", "RaycastParams __namecall")
    _src, _line, _name, _pc, _va = debug.info(__raycastparamsNC, "slna")
    assert(type(__raycastparamsNC) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true and __raycastparamsNC ~= __raycastparamsIndex, "RaycastParams __namecall")
    assert(getmetatable(__raycastparams) == "The metatable is locked", "RaycastParams Metatable Access")

    assert(Axes, "Missing Global Axes")
    assert(Axes.new, "Missing Global Axes.new")
    _src, _line, _name, _pc, _va = debug.info(Axes.new, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "new" and _pc == 0 and _va == true, "Global Axes.new Debug Info")
    local __axes: any = (Axes.new :: any)(Enum.NormalId.Top)
    assert(typeof(__axes) == "Axes", "Axes Type")
    assert(pcall(function() return __axes.X end), "[1] Axes __index")
    local __axesIndex: (...any) -> ...any
    xpcall(function() return (__axes :: any).____ end, function()
        __axesIndex = debug.info(2, "f")
    end)
    assert(type(__axesIndex) == "function", "Axes __index")
    _src, _line, _name, _pc, _va = debug.info(__axesIndex, "slna")
    assert(type(__axesIndex) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true, "[2] Axes __index")
    local __axesNC: (...any) -> ...any
    xpcall(function() return (__axes :: any):____() end, function()
        __axesNC = debug.info(2, "f")
    end)
    assert(type(__axesNC) == "function", "Axes __namecall")
    _src, _line, _name, _pc, _va = debug.info(__axesNC, "slna")
    assert(type(__axesNC) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true and __axesNC == __axesIndex, "Axes __namecall")
    assert(getmetatable(__axes) == "The metatable is locked", "Axes Metatable Access")

    assert(Content, "Missing Global Content")
    assert(Content.fromUri, "Missing Global Content.fromUri")
    _src, _line, _name, _pc, _va = debug.info(Content.fromUri, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "fromUri" and _pc == 0 and _va == true, "Global Content.fromUri Debug Info")
    assert(pcall(Content.fromUri :: any, "rbxassetid://7229442422"), "Content.fromUri")

    assert(Color3, "Missing Global Color3")
    assert(Color3.fromHex, "Missing Global Color3.fromHex")
    _src, _line, _name, _pc, _va = debug.info(Color3.fromHex, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "fromHex" and _pc == 0 and _va == true, "Global Color3.fromHex Debug Info")
    assert(pcall(Color3.fromHex :: any, "000"), "Color3.fromHex")
    assert(Color3.new, "Missing Global Color3.new")
    _src, _line, _name, _pc, _va = debug.info(Color3.new, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "new" and _pc == 0 and _va == true, "Global Color3.new Debug Info")
    assert(pcall(Color3.new :: any), "Color3.new")
    assert(Color3.fromHSV, "Missing Global Color3.fromHSV")
    _src, _line, _name, _pc, _va = debug.info(Color3.fromHSV, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "fromHSV" and _pc == 0 and _va == true, "Global Color3.fromHSV Debug Info")
    assert(pcall(Color3.fromHSV :: any, 1, 1, 1), "Color3.fromHSV")
    assert(Color3.fromRGB, "Missing Global Color3.fromRGB")
    _src, _line, _name, _pc, _va = debug.info(Color3.fromRGB, "slna")
    assert(_src == "[C]" and _line == -1 and _name == "fromRGB" and _pc == 0 and _va == true, "Global Color3.fromRGB Debug Info")
    __color3 = (Color3.fromRGB :: any)()
    assert(typeof(__color3) == "Color3", "Color3 Type")
    assert(pcall(function() return __color3.R end), "[1] Color3 __index")
    xpcall(function() return (__color3 :: any).____ end, function()
        __color3Index = debug.info(2, "f")
    end)
    assert(type(__color3Index) == "function", "Color3 __index")
    _src, _line, _name, _pc, _va = debug.info(__color3Index, "slna")
    assert(type(__color3Index) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true, "[2] Color3 __index")
    xpcall(function() return (__color3 :: any):____() end, function()
        __color3NC = debug.info(2, "f")
    end)
    assert(type(__color3NC) == "function", "Color3 __namecall")
    _src, _line, _name, _pc, _va = debug.info(__color3NC, "slna")
    assert(type(__color3NC) == "function" and _src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true and __color3NC ~= __color3Index, "Color3 __namecall")
    assert(getmetatable(__color3) == "The metatable is locked", "Color3 Metatable Access")
end)()
-- // Generated Global Checks End

local s, e, e2, e3

if not NO_STACK_OVERFLOW_CHECKS then
    local wrapped = coroutine.wrap(function()
        return 1
    end)
    for i = 1, LUAI_MAXCCALLS - 3 do
        wrapped = coroutine.wrap(wrapped)
    end
    s, e, e2 = pcall(wrapped)
    assert(s, "[1] Stack Level")
    assert(e == 1, "coroutine.wrap Implementation")

    wrapped = coroutine.wrap(function()
        return 1
    end)
    for i = 1, LUAI_FMAXCCALLS - 3 do
        wrapped = coroutine.wrap(wrapped)
    end
    s, e, e2 = pcall(wrapped)
    assert(s, "[1] For Loop")

    wrapped = coroutine.wrap(function()
        return 1
    end)
    for i = 1, LUAI_MAXCCALLS - 2 do
        wrapped = coroutine.wrap(wrapped)
    end
    s = pcall(wrapped)
    assert(not s, "[2] Invalid Stack Level")

    wrapped = coroutine.wrap(function()
        return 1
    end)
    for i = 1, LUAI_FMAXCCALLS - 2 do
        wrapped = coroutine.wrap(wrapped)
    end
    s = pcall(wrapped)
    assert(not s, "[2] For Loop")
end

local thread = task.spawn(function()
    repeat task.wait() until false
end)
assert(type(thread) == "thread", "[1] Threads")
assert(coroutine.status(thread) == "suspended", "[2] Threads")
task.cancel(thread)
assert(coroutine.status(thread) == "dead", "[3] Threads")

local n = 0
task.spawn(function()
    n += 1
end)
local running = coroutine.running()
local e4, e5
task.defer(function()
    e5 = select(2, pcall(coroutine.status, running))
    e4 = select(2, pcall(task.spawn, running, TAG))
end)
task.defer(function()
    n += 10
end)
task.defer(function()
    e5 = select(2, pcall(coroutine.status, running))
    e4 = select(2, pcall(task.spawn, running))
end)
assert(n == 1, "[1] Task Scheduler")

local __instanceNI: (...any) -> ...any
xpcall(function()
    (game :: any)[nil] = nil
end, function()
    __instanceNI = debug.info(2, `f\0{TAG}`)
end)
assert(__instanceNI and type(__instanceNI) == "function" and debug.info(__instanceNI, `s\0{TAG}`) == "[C]", "[3] Instance __newindex")

assert(__instanceIndex and type(__instanceIndex) == "function", "[4] Instance __index")
assert(not pcall(__instanceIndex, game, "Service"), "[5] Instance __index")

assert(__instanceIndex(workspace, "GetChildren") == __instanceIndex(game, "GetChildren"), "[6] Instance __index")
assert(__instanceIndex(workspace, "GetChildren") ~= __instanceIndex(game, "getChildren"), "[7] Instance __index")
assert(__instanceIndex(workspace, "FindFirstChild") == __instanceIndex(game, "FindFirstChild"), "[8] Instance __index")
assert(__instanceIndex(workspace, "FindFirstChild") ~= __instanceIndex(game, "findFirstChild"), "[9] Instance __index")
assert(__instanceIndex(workspace, "FindFirstChildWhichIsA") == __instanceIndex(game, "findFirstChildWhichIsA"), "[10] Instance __index")
assert(__instanceIndex(workspace, "IsA") ~= __instanceIndex(game, "isA"), "[11] Instance __index")
assert(__instanceIndex(game, "getService") ~= __instanceIndex(game, "GetService"), "[12] Instance __index")
assert(__instanceIndex(workspace, "GetAttribute") == __instanceIndex(game, "getAttribute"), "[13] Instance __index")

local srep = string.rep
s, e = pcall(__instanceIndex, game, `GetChildren{srep("\0", I8_MAX - 10)}`)
assert(not s and string.find(e, "GetChildren is not a valid member of DataModel", nil, true), "[14] Instance __index")

local proxy = newproxy(true)
getmetatable(proxy).__namecall = function() return true end

assert(proxy:getServerTimeNow() and __instanceNC ~= __randomNC, "[1] Roblox __namecalls")
local now = (function()
    local s, now = pcall(__instanceNC, workspace)
    assert(s and type(now) == "number" and proxy:isA(), "[1] Luau __namecall")
    assert(__instanceNC(workspace, "Object"), "workspace Type")
    return now
end)()

s, e = pcall(__randomNC, __instance)
assert(not s and e == "isA is not a valid member of Random", "[2] Roblox __namecalls")

assert(type(game) == "userdata"
    and typeof(game) == "Instance"
    and __instanceNC(game, "Object")
    and __instanceNC(game, "Instance")
    and __instanceNC(game, "ServiceProvider")
    and __instanceNC(game, "DataModel"), "DataModel Type")
if NO_SCRIPT_GLOBAL_CHECKS then
    assert(type(script) == "userdata"
        and typeof(script) == "Instance"
        and __instanceNC(script, "LuaSourceContainer")
        and proxy:isDescendantOf()
        and __instanceNC(script, game), "script Type")
end

proxy:NextInteger()
s, e = pcall(__randomNC, __instance)
assert(not s and e == "invalid argument #1 (Random expected, got Instance)", "[3] Roblox __namecalls")

local proxy2 = newproxy(true)
getmetatable(proxy2).__type = "Random"
s, e = pcall(__randomNC, proxy2)
assert(not s and e == "invalid argument #1 (Random expected, got userdata)", "[4] Roblox __namecalls")

local defaultPartProps: {[string]: any} = {
    Anchored = false,
    Archivable = true,
    AssemblyAngularVelocity = vector.zero,
    AssemblyCenterOfMass = vector.zero,
    AssemblyLinearVelocity = vector.zero,
    AssemblyMass = 6.720000267028809,
    AudioCanCollide = true,
    BackParamA = -0.5,
    BackParamB = 0.5,
    BackSurface = Enum.SurfaceType.Smooth,
    BackSurfaceInput = Enum.InputType.NoInput,
    BottomParamA = -0.5,
    BottomParamB = 0.5,
    BottomSurface = Enum.SurfaceType.Inlet,
    BottomSurfaceInput = Enum.InputType.NoInput,
    BrickColor = BrickColor.new("Medium stone grey"),
    CFrame = CFrame.new(),
    CanCollide = true,
    CanQuery = true,
    CanTouch = true,
    Capabilities = SecurityCapabilities.new(),
    CastShadow = true,
    CenterOfMass = vector.zero,
    ClassName = "Part",
    CollisionGroup = "Default",
    CollisionGroupId = 0,
    Color = Color3.new(0.6392157077789307, 0.6352941393852234, 0.6470588445663452),
    CurrentPhysicalProperties = (PhysicalProperties.new :: any)(0.699999988, 0.300000012, 0.5, 1, 1, 0.300000012),
    Elasticity = 0.5,
    EnableFluidForces = true,
    ExtentsCFrame = CFrame.new(),
    ExtentsSize = vector.create(4, 1.20000005, 2),
    FormFactor = Enum.FormFactor.Brick,
    Friction = 0.30000001192092896,
    FrontParamA = -0.5,
    FrontParamB = 0.5,
    FrontSurface = Enum.SurfaceType.Smooth,
    FrontSurfaceInput = Enum.InputType.NoInput,
    LeftParamA = -0.5,
    LeftParamB = 0.5,
    LeftSurface = Enum.SurfaceType.Smooth,
    LeftSurfaceInput = Enum.InputType.NoInput,
    LocalTransparencyModifier = 0,
    Locked = false,
    Mass = 6.720000267028809,
    Massless = false,
    Material = Enum.Material.Plastic,
    MaterialVariant = "",
    Name = "Part",
    Orientation = vector.zero,
    PivotOffset = CFrame.new(),
    Position = vector.zero,
    ReceiveAge = 0,
    Reflectance = 0,
    ResizeIncrement = 1,
    ResizeableFaces = Faces.new(
        Enum.NormalId.Right, Enum.NormalId.Top,
        Enum.NormalId.Back, Enum.NormalId.Left,
        Enum.NormalId.Bottom, Enum.NormalId.Front
    ),
    RightParamA = -0.5,
    RightParamB = 0.5,
    RightSurface = Enum.SurfaceType.Smooth,
    RightSurfaceInput = Enum.InputType.NoInput,
    RootPriority = 0,
    RotVelocity = vector.zero,
    Rotation = vector.zero,
    Sandboxed = false,
    Shape = Enum.PartType.Block,
    Size = vector.create(4, 1.20000005, 2),
    SpecificGravity = 0.699999988079071,
    TopParamA = -0.5,
    TopParamB = 0.5,
    TopSurface = Enum.SurfaceType.Studs,
    TopSurfaceInput = Enum.InputType.NoInput,
    Transparency = 0,
    Velocity = vector.zero
}
local part = assert((function()
    local s, e = pcall(Instance.new :: any, `Part\0{TAG}`)
    return s and typeof(e) == "Instance" and e
end)(), "Instance.new C-Strings")
local gsub, lower = string.gsub, string.lower
for k, v in next, defaultPartProps do
    assert((part :: any)[k] == v, `[Part.{k}] Default Property`)
    assert((part :: any)[gsub(k, `^%u\0{TAG}`, lower)] == v, `[Part.{k}] Lowercase Default Property`)
end

assert(proxy:isA()
   and __instanceNC(part, "Part")
   and __instanceNC(part, "FormFactorPart")
   and __instanceNC(part, "CornerWedgePart")
   and __instanceNC(part, "PVInstance")
   and __instanceNC(part, "Instance"), "Part Type")

local newVec = vector.create(1, 2, 3)
local newVec3 = Vector3.new(1, 2, 3)
s, e = pcall(__instanceNI, part, "position", newVec)
assert(not s and e == `position is not a valid member of Part "Part"`, "[4] Instance __newindex")

s, e = pcall(__instanceNI, part, "Position", newVec)
assert(s and e == nil, "[5] Instance __newindex")

s, e = pcall(__instanceIndex, part, "Position")
assert(s and type(e) == "vector" and e == newVec and rawequal(e, newVec) and e == newVec3 and rawequal(e, newVec3), "Instance __newindex | Vector3/vector")

local red1, red2 = BrickColor.Red(), BrickColor.Red()
assert(red1 == red2 and not rawequal(red1, red2), "BrickColor.Red")

s, e = pcall(__instanceNI, part, "brickColor", red1)
assert(s and e == nil, "[6] Instance __newindex")

s, e = pcall(__instanceIndex, part, "BrickColor")
assert(s and e == red1 and e == red2 and not rawequal(e, red1), "[15] Instance __index")

for i = 1, proxy:NextInteger() and __randomNC(Random.new(now), 1, 16) do
    Instance.fromExisting(part).Parent = part
end
assert(proxy:getChildren() and #__instanceNC(part) == (proxy:NextInteger() and __randomNC(Random.new(now), 1, 16)), "[1] Random Class")
proxy:NextUnitVector()
pcall(function() __instanceIndex(game, "Loaded"):NextInteger() end)
e = __randomNC(Random.new(67))
assert(type(e) == "vector" and typeof(e) == "Vector3", "[2] Luau __namecall")
assert(e == vector.create(-0.6120325922966003, 0.7562759518623352, -0.23122042417526245), "[2] Random Class")

assert(proxy:queryDescendants() and not __instanceNC(game, `>ReplicatedFirst\0{TAG}`)[2], "[1] QueryDescendants")
assert(__instanceNC(game, `>ReplicatedFirst\0{TAG}`)[1] == (proxy:service() and __instanceNC(game, "ReplicatedFirst")), "[2] QueryDescendants")
assert(__instanceIndex(__instanceNC(game, "RunService"), "name") == "Run Service", "[1] Service Name")
assert(__instanceIndex(__instanceNC(game, "TeleportService"), "name") == "Teleport Service", "[2] Service Name")
assert(__instanceIndex(__instanceNC(game, "ScriptContext"), "name") == "Script Context", "[3] Service Name")

local BE = Instance.new("BindableEvent")
local event = __instanceIndex(BE, "Event")
assert(event == __instanceIndex(BE, "Event"), "[1] BindableEvent")
assert(not rawequal(event, __instanceIndex(BE, "Event")), "[2] BindableEvent")
assert(rawequal(event, event), "[1] RBXScriptSignal")

local eventIndex: (...any) -> ...any
xpcall(function()
    (event :: any):____()
end, function()
    eventIndex = debug.info(2, `f\0{TAG}`)
end)

assert(select(2, pcall(eventIndex, event, `Connect\0{TAG}`)) ~= select(2, pcall(eventIndex, event, `Connect\0{TAG}`)), "[2.1] RBXScriptSignal")

local eventConnect = select(2, pcall(eventIndex, event, `connect\0{TAG}`))
assert(eventConnect ~= select(2, pcall(eventIndex, event, `connect\0{TAG}`)), "[2.2] RBXScriptSignal")
assert(select(2, pcall(eventIndex, event, `Wait\0{TAG}`)) ~= select(2, pcall(eventIndex, event, `Wait\0{TAG}`)), "[2.3] RBXScriptSignal")

local eventWait = select(2, pcall(eventIndex, event, `wait\0{TAG}`))
assert(eventWait ~= select(2, pcall(eventIndex, event, `wait\0{TAG}`)), "[2.4] RBXScriptSignal")

local eventOnce = select(2, pcall(eventIndex, event, `Once\0{TAG}`))
assert(eventOnce ~= select(2, pcall(eventIndex, event, `Once\0{TAG}`)), "[2.5] RBXScriptSignal")
assert(select(2, pcall(eventIndex, event, `once\0{TAG}`)) == select(2, pcall(eventIndex, event, `once\0{TAG}`)), "[2.6] RBXScriptSignal") -- For some reason this just doesn't have a camelCase counterpart
assert(select(2, pcall(eventIndex, event, `ConnectParallel\0{TAG}`)) ~= select(2, pcall(eventIndex, event, `ConnectParallel\0{TAG}`)), "[2.7] RBXScriptSignal")
assert(select(2, pcall(eventIndex, event, `connectParallel\0{TAG}`)) ~= select(2, pcall(eventIndex, event, `connectParallel\0{TAG}`)), "[2.8] RBXScriptSignal")

local stackLevel = 1
local another = Instance.new(`Part\0{TAG}`) :: Part
local changed = eventConnect(__instanceIndex(another, "changed"), function(...)
    stackLevel += 1
    if stackLevel >= 7 then return end
    proxy:NextInteger()
    local currName = assert(tonumber(__instanceIndex(another, "name")))
    __instanceNI(another, "Name", __randomNC(Random.new(), currName, currName + 1e9))
end)

assert(proxy:NextInteger() and pcall(__instanceNI, another, "Name", __randomNC(Random.new(), -2e9, -1e9 - 1)), "Signal Re-entrance Limit")
assert(stackLevel == 7, proxy:fire() and "[3] RBXScriptSignal")

thread = task.spawn(function()
    local ret = table.pack(eventWait(event), proxy:NextInteger())
    for i = 1, 4 do
        __randomNC(__random, 1, 2)
    end
    assert(ret[2] and ret[1] == 67, "[4] RBXScriptSignal")
end)
local deferredThread = task.defer(function()
    local ret = table.pack(eventWait(event), proxy:NextInteger())
    for i = 1, 4 do
        __randomNC(__random, 1, 2)
    end
    assert(ret[2] and ret[1] == 67, "[4] RBXScriptSignal")
end)
__instanceNC(BE, 67)
assert(coroutine.yield() == TAG and e5 == "suspended", "[2] Task Scheduler")
local gcThen = gcinfo()
assert(coroutine.status(thread) == "dead", "[3] Task Scheduler")
assert(coroutine.status(deferredThread) == "suspended", "[3.1] Task Scheduler")
task.cancel(deferredThread)
assert(coroutine.status(sthread) == "dead", "[4] Task Scheduler")
s, e = pcall(task.wait, -math.huge)
assert(s and e > 0, "[1] task.wait")
assert(n == 11, "[5] Task Scheduler")
assert(e4 and e4 == "Cannot call task.spawn on a thread that is already 'waiting' in the task library", "[6] Task Scheduler")

local min = Vector3.new(-1, -1, -1)
local vecs = {
    vector.create(1, 2, 3),
    vector.zero,
    Vector3.new(3, 2, 1),
    min,
    vector.create(2, 2, 2)
} :: {vector}
assert(rawequal(vector.min(table.unpack(vecs)), min), "[1] vector/Vector3")
assert(-vector.create(1, 1, 1) == min :: any, "[2] vector/Vector3")
assert(vector.create(1, 1, 1) ~= min :: any, "[3] vector/Vector3")

local c1, c2 = Color3.new(math.nan, 0, 0), Color3.new(0, math.nan, math.nan)
assert(math.isfinite(c1.G) and math.isfinite(c1.B), "[1] Color3")
proxy:ToHSV()
local r1, g1, b1 = __color3NC(c1)
local r2, g2, b2 = __color3NC(c2)
assert(math.isnan(r1) and math.isnan(g1) and math.isnan(b1), "[2] Color3")
assert(math.isfinite(r2) and math.isfinite(g2) and math.isfinite(b2), "[3] Color3")

r1, g1, b1 = Color3.toHSV(c1)
r2, g2, b2 = Color3.toHSV(c2)
assert(math.isnan(r1) and math.isnan(g1) and math.isnan(b1), "[2] Color3")
assert(math.isfinite(r2) and math.isfinite(g2) and math.isfinite(b2), "[3] Color3")
assert(__color3Index(c1, "ToHSV") ~= Color3.toHSV, "[4] Color3")
assert(select(2, pcall(__color3Index, c1, "Lerp")) ~= select(2, pcall(__color3Index, c1, "Lerp")), "[5] Color3")
assert(select(2, pcall(__color3Index, c1, "lerp")) ~= select(2, pcall(__color3Index, c1, "lerp")), "[6] Color3")
assert(select(2, pcall(__color3Index, c1, "ToHSV")) ~= select(2, pcall(__color3Index, c1, "ToHSV")), "[7] Color3")
assert(select(2, pcall(__color3Index, c1, "toHSV")) == select(2, pcall(__color3Index, c1, "toHSV")), "[7] Color3")
assert(select(2, pcall(__color3Index, c1, "ToHex")) ~= select(2, pcall(__color3Index, c1, "ToHex")), "[8] Color3")
assert(select(2, pcall(__color3Index, c1, "toHex")) == select(2, pcall(__color3Index, c1, "toHex")), "[9] Color3")

s, e = pcall(__color3Index, c1, `ToHSV\0{TAG}`)
assert(not s and e == "ToHSV is not a valid member of Color3", "[9.1] Color3")

s, e = pcall(proxy:ToHex() and __color3NC, c1)
assert(not s and e == "Unable to convert color to valid hex code", "[10] Color3")

s, e = pcall(__color3NC, c2)
assert(not s and e == "Unable to convert color to valid hex code", "[11] Color3")

assert(pcall(Color3.fromHex, `{proxy:NextInteger() and srep("0", __randomNC(Random.new(2), 1, 10))}\0Hello World!`), "[6] Color3/Random")

s, e = pcall(Color3.fromHex, `{srep("0", __randomNC(Random.new(6), 1, 10))}\0Hello World!`)
assert(not s and type(e) == "string" and e == "Unable to convert characters to hex value", "[7] Color3/Random")

local ssub = string.sub
s, e = pcall(function() ({})[Vector3.new(math.nan)] = 1 end)
assert(not s and type(e) == "string" and ssub(e, -24) == "table index contains NaN", "[1] Luau Tables")

s, e = pcall(function() ({})[vector.create(math.nan, math.nan)] = 1 end)
assert(not s and type(e) == "string" and ssub(e, -24) == "table index contains NaN", "[2] Luau Tables")

s, e = pcall(function() ({})[math.nan] = 1 end)
assert(not s and type(e) == "string" and ssub(e, -18) == "table index is NaN", "[3] Luau Tables")

s, e = pcall(function() proxy:FireServer(); ({})[nil] = 1 end)
assert(not s and type(e) == "string" and ssub(e, -18) == "table index is nil", "[4] Luau Tables")

assert(type(next).sub == string.sub, "string")

local RE = Instance.new(`RemoteEvent\0{TAG}`) :: RemoteEvent

local t = {}
for i = 1, 298 do
    t = {t}
end

assert(pcall(__instanceNC, RE, t), "[1] RemoteEvent")

s, e = pcall(__instanceNC, RE, 1, t)
assert(not s and e == "Max lua stack size reached", "[2] RemoteEvent")

s, e = pcall(__instanceNC, RE, t)
assert(s and not e, "[3] RemoteEvent")

local large: any = table.create(7995, 1)
table.insert(large, t)

s, e = pcall(__instanceNC, RE, table.unpack(large))
assert(not s and e == "Max lua stack size reached", "[4] RemoteEvent")

s, e = pcall(__instanceNC, RE, 1, table.unpack(large))
assert(not s and e == "Unable to make room on stack to bridge value", "[5] RemoteEvent")

s, e = pcall(__instanceNC, RE, 1, 1, 1, table.unpack(large))
assert(not s and e == "Unable to make room on stack to bridge value", "[6] RemoteEvent")

s, e = pcall(__instanceNC, RE, 1, 1, 1, 1, 1, table.unpack(large))
assert(not s and e == "Unable to make room on stack to bridge value", "[7] RemoteEvent")

large[7996] = {[proxy] = 1}
s, e = pcall(__instanceNC, RE, table.unpack(large))
assert(not s and e == "Additional Luau stack reservation has failed", "[8] RemoteEvent")

s, e = pcall(table.unpack, table.create(7999, 1))
assert(s and e == 1, "[1] table.unpack")

s, e = pcall(table.unpack, table.create(8000, 1))
assert(not s and e == "too many results to unpack", "[2] table.unpack")

s, e = pcall(unpack, table.create(7999, 1))
assert(s and e == 1, "[1] unpack")

s, e = pcall(unpack, table.create(8000, 1))
assert(not s and e == "too many results to unpack", "[2] unpack")
assert(unpack ~= table.unpack, "unpack/table.unpack")

assert(debug.info(PhysicalProperties.new, `n\0{TAG}`) == "newPhysicalPropertiesWithClampedMsgClosure", "PhysicalProperties.new")

assert(select(2, pcall(table.insert :: any, large)) == "wrong number of arguments to 'insert'", "[2] table.insert")
assert(select(2, pcall(table.insert :: any, large, 1, 1, 1)) == "wrong number of arguments to 'insert'", "[3] table.insert")

s, e = pcall(table.move, {}, math.nan, math.nan, math.nan, large)
assert(s and e == large, "[2] table.move")

s, e = pcall(table.move, {}, -math.huge, math.nan, math.nan, large)
local isOnPc = s and e == large

s, e = pcall(table.move, {}, 1, INT_MAX, 2, large)
assert(not s and type(e) == "string" and e == "invalid argument #4 to 'move' (destination wrap around)", "[4] table.move")

s, e = pcall(table.move, {}, 1, INT_FMAX, 2, large)
assert(not s and type(e) == "string" and e == "invalid argument #4 to 'move' (destination wrap around)", "[4.1] table.move")

s, e = pcall(table.move, {}, 1, INT_FMAX - 1, 2, large)
assert(not s and type(e) == "string" and e == "table overflow", "[4.2] table.move")

if isOnPc then
    s, e = pcall(table.move, {}, 1, math.huge, math.huge, large)
    assert(s and e == large, "[5] table.move")
end

s, e = pcall(table.move, {}, 1, INT_MAX, 1, large)
assert(not s and type(e) == "string" and e == "table overflow", "[6] table.move")

s, e = pcall(table.move, {}, 1, INT_FMAX, 1, large)
assert(not s and type(e) == "string" and e == "table overflow", "[6.1] table.move")

if isOnPc then
    s, e = pcall(table.move, {}, 1, math.huge, 1, large)
    assert(s and e == large, "[7] table.move")
end

s, e = pcall(table.move, {}, -INT_MAX, INT_MAX, -INT_MAX, large)
assert(not s and type(e) == "string" and e == "invalid argument #3 to 'move' (too many elements to move)", "[8] table.move")

s, e = pcall(table.move, {}, -INT_FMAX, INT_FMAX, -INT_FMAX, large)
assert(not s and type(e) == "string" and e == "invalid argument #3 to 'move' (too many elements to move)", "[8.1] table.move")

s, e = pcall(srep, "\0", STR_MAX + 1)
assert(not s and type(e) == "string" and e == "resulting string too large", "[2] string.rep")

s, e = pcall(srep, "\0", STR_FMAX + 1)
assert(not s and type(e) == "string" and e == "resulting string too large", "[2.1] string.rep")

s, e = pcall(srep, "\0\0", STR_MAX / 2 + 1)
assert(not s and type(e) == "string" and e == "resulting string too large", "[3] string.rep")

s, e = pcall(srep, "\0\0", STR_MAX / 2 + 1.9999999)
assert(not s and type(e) == "string" and e == "resulting string too large", "[3.1] string.rep")

s, e = pcall(srep, "\0\0\0\0", STR_MAX / 4 + 1)
assert(not s and type(e) == "string" and e == "resulting string too large", "[4] string.rep")

s, e = pcall(srep, "\0\0\0\0", STR_MAX / 4 + 1.9999999)
assert(not s and type(e) == "string" and e == "resulting string too large", "[4.1] string.rep")

s, e = pcall(srep, "", math.huge)
assert(s and e == "", "[5] string.rep")

s, e = pcall(srep, "", STR_MAX)
assert(s and e == "", "[6] string.rep")

s, e = pcall(srep, "", STR_FMAX)
assert(s and e == "", "[6.1] string.rep")

if isOnPc then
    s, e = pcall(srep, "a", UINT_MAX)
    assert(s and e == "", "[6.2] string.rep")
end

local schar = string.char
s, e = pcall(schar, UCODE_MAX + 1)
assert(not s and type(e) == "string" and e == "invalid argument #1 to 'char' (invalid value)", "[2] string.char")

s, e = pcall(schar, UCODE_FMAX + 1)
assert(not s and type(e) == "string" and e == "invalid argument #1 to 'char' (invalid value)", "[2.1] string.char")

s, e = pcall(schar, UCODE_MAX)
assert(s and e == "\255", "[3] string.char")

s, e = pcall(schar, UCODE_FMAX)
assert(s and e == "\255", "[3.1] string.char")

local match = `{srep("(", CAPTURE_MAX)}{srep(")", CAPTURE_MAX)}`
s, e = pcall(string.match :: any, "", match)
assert(s and e == "", "[2] string.match")

match = `{srep("(", CAPTURE_FMAX)}{srep(")", CAPTURE_FMAX)}`
s, e = pcall(string.match :: any, "", match)
assert(s and e == "", "[2.1] string.match")

s, e = pcall(string.match :: any, "", `({match})\0{TAG}`)
assert(not s and type(e) == "string" and e == "too many captures", "[3] string.match")

s, e = pcall(string.match :: any, "", `({match}\0{TAG}`)
assert(not s and type(e) == "string" and e == "too many captures", "[4] string.match")

s, e = pcall(string.match :: any, "", ssub(match, 1, #match - 1))
assert(not s and type(e) == "string" and e == "unfinished capture", "[5] string.match")

s, e, e2 = pcall(string.find :: any, srep("a", LUAI_MAXCCALLS - 1), srep("a?", LUAI_MAXCCALLS - 1))
assert(s and e == 1 and e2 == 199, "[2] string.find")

s, e, e2 = pcall(string.find :: any, srep("a", LUAI_FMAXCCALLS - 1), srep("a?", LUAI_FMAXCCALLS - 1))
assert(s and e == 1 and e2 == 199, "[2.1] string.find")

s, e, e2 = pcall(string.find :: any, srep("a", LUAI_MAXCCALLS), srep("a?", LUAI_MAXCCALLS))
assert(not s and e == "pattern too complex", "[3] string.find")

s, e, e2 = pcall(string.find :: any, srep("a", LUAI_FMAXCCALLS), srep("a?", LUAI_FMAXCCALLS))
assert(not s and e == "pattern too complex", "[3.1] string.find")

math.randomseed(proxy:NextNumber() and 438)
assert(math.random() == 0.01841840311174769, "math.randomseed")

s, e, e2 = pcall(string.gsub :: any, `hello\0{TAG}`, "l", `%{math.random(-1, 2)}\0{TAG}`)
assert(not s and type(e) == "string" and e == "invalid use of '%' in replacement string", "[1] string.gsub")

s, e, e2 = pcall(string.gsub :: any, `hello\0{TAG}`, `l\0{TAG}`, `%1\0{TAG}`)
assert(s and type(e) == "string" and e == `hello\0{TAG}` and e2 == 0, "[1.1] string.gsub")

s, e, e2 = pcall(string.gsub :: any, `hello\0{TAG}`, "l", `%{math.random(-1, 2)}\0{TAG}`)
assert(s and e == `hel\0{TAG}l\0{TAG}o\0{TAG}` and e2 == 2, "[2] string.gsub")

s, e, e2 = pcall(string.gsub :: any, `hello\0{TAG}`, "l", `%{math.random(-1, 2)}\0{TAG}`)
assert(s and e == `hel\0{TAG}l\0{TAG}o\0{TAG}` and e2 == 2, "[3] string.gsub")

s, e, e2 = pcall(string.gsub :: any, `hello\0{TAG}`, "l", `%{math.random(-1, 2)}\0{TAG}`)
assert(not s and type(e) == "string" and e == "invalid capture index", "[4] string.gsub")

assert(__randomNC(__random) == math.random(), "math.randomseed/Random.new")

__randomNC(__random)
math.random(67, 67)
math.random(67, 67)

assert(__randomNC(__random) == math.random(), "[2] math.randomseed/Random.new")

local high = proxy:NextInteger() and __randomNC(Random.new(), 7, 1e8)
assert(math.abs(math.random(math.ceil(7.0426861911914775 - 0.20853723823829548 * high), high) - 6) // 1 <= 1, "[3] math.randomseed/Random.new")

s, e = pcall(math.clamp, math.nan, math.huge * math.huge, math.huge)
assert(s and e ~= e, "[1] math.clamp")

s, e = pcall(math.clamp, math.nan, -math.huge, math.nan)
assert(not s and type(e) == "string" and e == "invalid argument #3 to 'clamp' (max must be greater than or equal to min)", "[2] math.clamp")

s, e = pcall(math.sign, math.nan)
assert(s and e == 0, "math.sign")

s, e = pcall(math.lerp, 0, 0, math.huge)
assert(s and e ~= e, "[1] math.lerp")

s, e = pcall(math.lerp, math.nan, math.e, 1)
assert(s and e == math.e, "[2] math.lerp")

s, e = pcall(math.noise, 0.499999925494194, 0, 0)
assert(s and e == 5.960464477539063e-08, "[1] math.noise")

s, e = pcall(math.noise, 0.49999992549419403, 0, 0)
assert(s and e == 0, "[2] math.noise")

s, e = pcall(math.noise, 0, math.huge, 0)
assert(s and e ~= e, "[3] math.noise")

s, e = pcall(math.noise, 2 ^ 128, 0, 0)
assert(s and e ~= e, "[4] math.noise")

s, e = pcall(math.noise, 3.4028235677973362e38, 0, 0)
assert(s and e == 0, "[5] math.noise")

s, e = pcall(math.noise, -0.5, 0, 0)
assert(s and e == -0.5, "[6] math.noise")

s, e = pcall(math.noise, NOISE_SMALL, 0, 0)
assert(s and e - NOISE_SMALL == 3.503246160812043e-46, "[7] math.noise")

s, e = pcall(math.noise, 1e-37, 0, 0)
assert(s and 1e-37 - e == 8.902421100874129e-46, "[8] math.noise")

s, e = pcall(__instanceNI, __instance, "Value", nil)
assert(s and not e, "ObjectValue")

s, e = pcall(__instanceNI, __instance, "Value", __instance)
assert(s and not e, "ObjectValue")

s, e = pcall(__instanceIndex, __instance, "Value")
assert(s and e == __instance and rawequal(e, __instance), "ObjectValue")

s, e = pcall(getmetatable, game)
assert(s and type(e) == "string" and e == "The metatable is locked", "Instance Metatable")

s, e = pcall(getmetatable, __instanceIndex(game, "Loaded"))
assert(s and type(e) == "string" and e == "The metatable is locked", "RBXScriptSignal Metatable")

s, e = pcall(getmetatable, changed)
assert(s and type(e) == "string" and e == "The metatable is locked", "RBXScriptConnection Metatable")

local rscIndex: (...any) -> ...any
xpcall(function()
    return (changed :: any)[nil]
end, function()
    rscIndex = debug.info(2, `f\0{TAG}`)
end)
assert(rscIndex and type(rscIndex) == "function" and debug.info(rscIndex, `s\0{TAG}`) == "[C]", "[1] RBXScriptConnection Index")

s, e = pcall(rscIndex, changed, `disconnect\0{TAG}`)
assert(s and type(e) == "function", "[2] RBXScriptConnection Index")
assert(e ~= rscIndex(changed, `disconnect\0{TAG}`), "[3] RBXScriptConnection Index")
assert(rscIndex(changed, `Disconnect\0{TAG}`) ~= rscIndex(changed, `Disconnect\0{TAG}`), "[4] RBXScriptConnection Index")
s, e2 = pcall(rscIndex, changed, `connected\0{TAG}`)
assert(s and e2 == true, "[5] RBXScriptConnection Index")
;(e :: any)(changed)
assert(rscIndex(changed, `connected\0{TAG}`) == false, "[1] RBXScriptConnection Disconnection")
assert(pcall(__instanceNI, another, "Name", __randomNC(Random.new(), -1e9, -1)) and stackLevel == 7, "[2] RBXScriptConnection Disconnect")

proxy:getPropertyChangedSignal()
s, e = pcall(__instanceNC, __instance, "Changed")
assert(not s and e == "Changed is not a valid property name.", "[1] GetPropertyChangedSignal")

s, e = pcall(__instanceNC, __instance, "Name")
assert(s and typeof(e) == "RBXScriptSignal", "[2] GetPropertyChangedSignal")

s, e2 = pcall(__instanceNC, __instance, "Name")
assert(s and e == e2 and not rawequal(e, e2), proxy:NextInteger() and "[3] GetPropertyChangedSignal")

local rand = __randomNC(Random.new(), 1, 7999)
s, e = pcall(select, `#{srep("\0", rand)}#{TAG}`, table.unpack(table.create(rand, 1)))
assert(s and e == rand, "select")

local newName = __randomNC(Random.new(), 1, 1e9)
assert(pcall(__instanceNI, another, "Name", newName), "[1] Implicit Instance __newindex")
assert(select(2, pcall(__instanceIndex, another, "name")) == tostring(newName), "[2] Implicit Instance __newindex")

s, e = pcall(bit32.bor, math.nan)
assert(s and e == 0, "bit32.bor")

s, e = pcall(bit32.btest, math.nan)
assert(s and e == false, "[1] bit32.btest")

s, e = pcall(bit32.btest, 0)
assert(s and e == false, "[2] bit32.btest")

s, e = pcall(bit32.btest, 1)
assert(s and e == true, "[3] bit32.btest")

s, e = pcall(bit32.band, math.nan)
assert(s and e == 0, "bit32.band")

s, e = pcall(bit32.bnot, math.nan)
assert(s and e == 4294967295, "bit32.bnot")

s, e = pcall(bit32.lshift, math.nan, math.nan)
assert(s and e == 0, "bit32.lshift")

s, e = pcall(bit32.rshift, math.nan, math.nan)
assert(s and e == 0, "bit32.rshift")

s, e = pcall(bit32.arshift, math.nan, math.nan)
assert(s and e == 0, "bit32.arshift")

s, e = pcall(bit32.countlz, math.nan)
assert(s and e == 32, "bit32.countlz")

s, e = pcall(bit32.countrz, math.nan)
assert(s and e == 32, "bit32.countrz")

if isOnPc then
    s, e = pcall(bit32.extract :: any, math.nan, math.nan)
    assert(not s and e == "invalid argument #2 to 'extract' (field cannot be negative)", "[1] bit32.extract")

    s, e = pcall(bit32.extract :: any, math.nan, math.huge)
    assert(not s and e == "invalid argument #2 to 'extract' (field cannot be negative)", "[2] bit32.extract")
end

s, e = pcall(bit32.extract :: any, math.nan, 31)
assert(s and e == 0, "[3] bit32.extract")

s, e = pcall(bit32.extract :: any, math.nan, 32)
assert(not s and e == "trying to access non-existent bits", "[4] bit32.extract")

s, e = pcall(bit32.extract :: any, math.nan, INT_MAX - 1)
assert(not s and e == "trying to access non-existent bits", "[5] bit32.extract")

if isOnPc then
    s, e = pcall(bit32.extract :: any, math.nan, INT_MAX)
    assert(s and e == 0, "[6] bit32.extract")
end

s, e = pcall(bit32.extract :: any, math.nan, 0)
assert(s and e == 0, "[7] bit32.extract")

if isOnPc then
    s, e = pcall(bit32.extract :: any, math.nan, INT_MAX + 1)
    assert(not s and e == "invalid argument #2 to 'extract' (field cannot be negative)", "[8] bit32.extract")

    s, e = pcall(bit32.extract :: any, math.nan, INT_MAX, INT_MAX)
    assert(s and e == 0, "[9] bit32.extract")

    s, e = pcall(bit32.extract :: any, math.nan, INT_MAX, INT_MAX + 1)
    assert(not s and e == "invalid argument #3 to 'extract' (width must be positive)", "[10] bit32.extract")
end

s, e = pcall(bit32.extract :: any, math.nan, INT_MAX, 0.9999999999999999)
assert(not s and e == "invalid argument #3 to 'extract' (width must be positive)", "[11] bit32.extract")

if isOnPc then
    s, e = pcall(bit32.replace :: any, math.nan, math.nan, math.nan)
    assert(not s and e == "invalid argument #3 to 'replace' (field cannot be negative)", "[1] bit32.replace")

    s, e = pcall(bit32.replace :: any, math.nan, math.nan, math.huge)
    assert(not s and e == "invalid argument #3 to 'replace' (field cannot be negative)", "[2] bit32.replace")
end

s, e = pcall(bit32.replace :: any, math.nan, math.nan, 31)
assert(s and e == 0, "[3] bit32.replace")

s, e = pcall(bit32.replace :: any, math.nan, math.nan, 32)
assert(not s and e == "trying to access non-existent bits", "[4] bit32.replace")

s, e = pcall(bit32.replace :: any, math.nan, math.nan, INT_MAX - 1)
assert(not s and e == "trying to access non-existent bits", "[5] bit32.replace")

if isOnPc then
    s, e = pcall(bit32.replace :: any, math.nan, math.nan, INT_MAX)
    assert(s and e == 0, "[6] bit32.replace")
end

s, e = pcall(bit32.replace :: any, math.nan, math.nan, 0)
assert(s and e == 0, "[7] bit32.replace")

if isOnPc then
    s, e = pcall(bit32.replace :: any, math.nan, math.nan, INT_MAX + 1)
    assert(not s and e == "invalid argument #3 to 'replace' (field cannot be negative)", "[8] bit32.replace")

    s, e = pcall(bit32.replace :: any, math.nan, math.nan, INT_MAX, INT_MAX)
    assert(s and e == 0, "[9] bit32.replace")

    s, e = pcall(bit32.replace :: any, math.nan, math.nan, INT_MAX, INT_MAX + 1)
    assert(not s and e == "invalid argument #4 to 'replace' (width must be positive)", "[10] bit32.replace")
end

s, e = pcall(bit32.replace :: any, math.nan, math.nan, INT_MAX, 0.9999999999999999)
assert(not s and e == "invalid argument #4 to 'replace' (width must be positive)", "[11] bit32.replace")

s, e = pcall(string.packsize, `c{STR_MAX + 1}\0{TAG}`)
assert(not s and type(e) == "string" and e == "size specifier is too large", "[1] string.packsize")

s, e = pcall(string.packsize, `c{STR_MAX}\0{TAG}`)
assert(s and e == 1073741824, "[1.1] string.packsize")

s, e = pcall(string.packsize, `i17\0{TAG}`)
assert(not s and type(e) == "string" and e == "integral size (17) out of limits [1,16]", "[2] string.packsize")

s, e = pcall(string.packsize, `i0\0{TAG}`)
assert(not s and type(e) == "string" and e == "integral size (0) out of limits [1,16]", "[3] string.packsize")

s, e = pcall(string.packsize, `c\0{TAG}`)
assert(not s and type(e) == "string" and e == "missing size for format option 'c'", "[4] string.packsize")

s, e = pcall(string.packsize, `k\0{TAG}`)
assert(not s and type(e) == "string" and e == "invalid format option 'k'", "[5] string.packsize")

s, e = pcall(string.packsize, `X\0{TAG}`)
assert(not s and type(e) == "string" and e == "invalid argument #1 to 'packsize' (invalid next option for option 'X')", "[6] string.packsize")

s, e = pcall(string.packsize, `Xc4\0{TAG}`)
assert(not s and type(e) == "string" and e == "invalid argument #1 to 'packsize' (invalid next option for option 'X')", "[7] string.packsize")

s, e = pcall(string.packsize, `!4i3\0{TAG}`)
assert(not s and type(e) == "string" and e == "invalid argument #1 to 'packsize' (format asks for alignment not power of 2)", "[8] string.packsize")

s, e = pcall(string.packsize, "s4")
assert(not s and type(e) == "string" and e == "invalid argument #1 to 'packsize' (variable-length format)", "[9] string.packsize")

r1 = __randomNC(Random.new(), 4, 12)
r2 = r1 + __randomNC(Random.new(), 1, r1)
local r3 = r2 + __randomNC(Random.new(), 1, r2)
local r4 = r3 + __randomNC(Random.new(), 1, r3)

local packT = table.create(r4, 1)
packT[r2] = INT_MAX

s, e = pcall(string.pack, `{srep("i", r3)}\0{TAG}`, table.unpack(packT))
assert(s and type(e) == "string" and e == `{srep("\1\0\0\0", r2 - 1)}\255\255\255\127{srep("\1\0\0\0", r3 - r2)}`, "[1] string.pack")

s, e = pcall(string.pack, `i\0{TAG}`, INT_MAX + 1)
assert(not s and type(e) == "string" and e == "invalid argument #2 to 'pack' (integer overflow)", "[2] string.pack")

r1 = __randomNC(Random.new(), r1, r4)
r2 = r1 + __randomNC(Random.new(), 1, r1)
r3 = r2 + __randomNC(Random.new(), 1, r2)
r4 = r3 + __randomNC(Random.new(), 1, r3)

packT = table.create(r4, 1)
packT[r2] = UINT_MAX

s, e = pcall(string.pack, `{srep("I", r3)}\0{TAG}`, table.unpack(packT))
assert(s and type(e) == "string" and e == `{srep("\1\0\0\0", r2 - 1)}\255\255\255\255{srep("\1\0\0\0", r3 - r2)}`, "[3] string.pack")

s, e = pcall(string.pack, `I\0{TAG}`, UINT_MAX + 1)
assert(not s and type(e) == "string" and e == "invalid argument #2 to 'pack' (unsigned overflow)", "[4] string.pack")

s, e = pcall(string.pack, `I\0{TAG}`, UINT_FMAX)
assert(s and type(e) == "string" and e == "\255\255\255\255", "[4.1] string.pack")

s, e = pcall(string.pack, `c{r3}{TAG}`, srep(schar(math.clamp(r1, 1, 255)), r4))
assert(not s and type(e) == "string" and e == "invalid argument #2 to 'pack' (string longer than given size)", "[5] string.pack")

local packStr = srep(schar(math.clamp(r2, 1, 255)), I8_MAX)
s, e = pcall(string.pack, `s1\0{TAG}`, packStr)
assert(s and type(e) == "string" and e == `\255{packStr}`, "[6] string.pack")

packStr = srep(schar(math.clamp(r3, 1, 255)), I8_FMAX)
s, e = pcall(string.pack, `s1\0{TAG}`, packStr)
assert(s and type(e) == "string" and e == `\255{packStr}`, "[6.1] string.pack")

s, e = pcall(string.pack, `s1\0{TAG}`, srep(schar(math.clamp(r4, 1, 255)), I8_MAX + 1))
assert(not s and type(e) == "string" and e == "invalid argument #2 to 'pack' (string length does not fit in given size)", "[6.2] string.pack")

s, e = pcall(string.pack, `z\0{TAG}`, `{TAG}\0{TAG}`)
assert(not s and type(e) == "string" and e == "invalid argument #2 to 'pack' (string contains zeros)", "[6.3] string.pack")

s, e = pcall(string.unpack, `i4\0{TAG}`, packStr, I8_MAX + 1)
assert(not s and type(e) == "string" and e == "invalid argument #2 to 'unpack' (data string too short)", "[1] string.unpack")

s, e = pcall(string.unpack, `i4\0{TAG}`, packStr, I8_MAX + 2)
assert(not s and type(e) == "string" and e == "invalid argument #3 to 'unpack' (initial position out of string)", "[2] string.unpack")

s, e = pcall(string.unpack :: any, `z\0{TAG}`, TAG)
assert(not s and type(e) == "string" and e == "invalid argument #2 to 'unpack' (unfinished string for format 'z')", "[3] string.unpack")

s, e = pcall(string.unpack :: any, `I16\0{TAG}`, srep("\255", 16))
assert(not s and type(e) == "string" and e == "16-byte integer does not fit into Lua Integer", "[4] string.unpack")

s, e = pcall(gcinfo)
assert(s and e >= 0 and e <= 1e8, "gcinfo")

s, e2 = pcall(collectgarbage, "count")
assert(s and e2 - e  <= 5, "collectgarbage")

s, e = pcall(table.isfrozen, t)
assert(s and e == false, "[1] table.isfrozen")

s, e = pcall(table.freeze, t)
assert(s and e == t, "[1] table.freeze")

s, e = pcall(table.freeze, t)
assert(not s and type(e) == "string" and e == "invalid argument #1 to 'freeze' (table is already frozen)", "[2] table.freeze")

s, e = pcall(table.isfrozen, t)
assert(s and e == true, "[2] table.isfrozen")

s, e = pcall(rawequal, "abcd", "abcd")
assert(s and e == true, "rawequal")

assert(type(Enum) == "userdata" and typeof(Enum) == "Enums", "[1] Enums")

local __enumsIndex: (...any) -> ...any, __enumsNC: (...any) -> ...any
xpcall(function()
    return (Enum :: any)[nil]
end, function()
    __enumsIndex = debug.info(2, `f\0{TAG}`)
end)
xpcall(function()
    return (Enum :: any):____()
end, function()
    __enumsNC = debug.info(2, `f\0{TAG}`)
end)
assert(type(__enumsIndex) == "function" and type(__enumsNC) == "function")
_src, _line, _name, _pc, _va = debug.info(__enumsIndex, `slna\0f{TAG}`)
assert(_src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true, "[1] Enums __index")
_src, _line, _name, _pc, _va = debug.info(__enumsNC, `slna\0f{TAG}`)
assert(_src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true and __enumsIndex == __enumsNC, "Enums __namecall")

local getEnums: any = select(2, pcall(__enumsIndex, Enum, `GetEnums\0{TAG}`))
assert(getEnums ~= __enumsIndex(Enum, `GetEnums\0{TAG}`), "[1] Enums.GetEnum")

local enums = getEnums(Enum)
local noOfEnums = #enums
local lastEnum = enums[noOfEnums]
local lastEnumName = tostring(lastEnum)
local lastEnumFullName = `Enum.{lastEnumName}`
local lastEnumFullNameLenP1 = #lastEnumFullName + 1
assert(type(lastEnum) == "userdata" and typeof(lastEnum) == "Enum", "[1] Enum")
assert(lastEnumName:sub(1, 1) == "Z", "Last Enum")
assert(noOfEnums >= 300, "Number of Enums")

local seen = {}
for i = 1, noOfEnums do
    local enum = enums[i]
    assert(type(enum) == "userdata" and typeof(enum) == "Enum", `[2, {i}] Enum`)

    local enumName = tostring(enum)
    assert(#enumName >= 4, `[3, {i}] Enum`)
    assert(rawequal(__enumsIndex(Enum, `{enumName}\0{TAG}`), enum), `[4, {i}] Enum`)

    assert(not seen[enumName], `[5, {i}] Enum`)
    seen[enumName] = true
end

local __enumIndex: (...any) -> ...any, __enumNC: (...any) -> ...any
xpcall(function()
    return lastEnum[nil]
end, function()
    __enumIndex = debug.info(2, `f\0{TAG}`)
end)
xpcall(function()
    return (lastEnum :: any):____()
end, function()
    __enumNC = debug.info(2, `f\0{TAG}`)
end)
assert(type(__enumIndex) == "function" and type(__enumNC) == "function")
_src, _line, _name, _pc, _va = debug.info(__enumIndex, `slna\0f{TAG}`)
assert(_src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true, "[1] Enum __index")
_src, _line, _name, _pc, _va = debug.info(__enumNC, `slna\0f{TAG}`)
assert(_src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true and __enumIndex == __enumNC, "Enum __namecall")

local getEnumItems: any = select(2, pcall(__enumIndex, lastEnum, `GetEnumItems\0{TAG}`))
assert(getEnumItems ~= __enumIndex(lastEnum, `GetEnumItems\0{TAG}`), "[1] Enum.GetEnumItems")

local enumItems = getEnumItems(lastEnum)
local noOfEnumItems = #enumItems
local lastEnumItem = enumItems[noOfEnumItems]
assert(type(lastEnumItem) == "userdata" and typeof(lastEnumItem) == "EnumItem", "[1] EnumItem")
assert(#tostring(lastEnumItem) >= 1, "Last EnumItem")
assert(noOfEnumItems >= 1, "Number of EnumItems")

seen = {}
local ssplit = string.split
for i = 1, noOfEnumItems do
    local enumItem = enumItems[i]
    assert(type(enumItem) == "userdata" and typeof(enumItem) == "EnumItem", `[2, {i}] EnumItem`)

    local fullName = tostring(enumItem)
    assert(fullName == `Enum.{lastEnumName}.{fullName:sub(-#fullName + lastEnumFullNameLenP1)}`, `[3, {i}] EnumItem`)

    local enumName = ssplit(fullName, ".")[3]
    assert(#enumName >= 4, `[4, {i}] EnumItem`)
    assert(rawequal(__enumIndex(lastEnum, `{enumName}\0{TAG}`), enumItem), `[5, {i}] EnumItem`)

    assert(not seen[enumName], `[6, {i}] EnumItem`)
    seen[enumName] = true
end

assert(getmetatable(newproxy()) == nil, "getmetatable | newproxy")

r1 = __randomNC(Random.new(), 1, 1e9)
__instanceNI(__instance, "Name", r1)
assert(tostring(__instance) == tostring(r1), "Instance __tostring")
assert(tostring(__color3) == "0, 0, 0", "Color3 __tostring")
assert(tostring(__cframe) == "0, 0, 0, 0.291926563, -0.454648674, 0.841470957, 0.837222338, -0.303896606, -0.454648674, 0.462425649, 0.837222338, 0.291926563", "CFrame __tostring")
assert(tostring(__vector3) == "0, 0, 0", "Vector3 __tostring")
assert(tostring(__vector3int16) == "0, 0, 0", "Vector3Int16 __tostring")

s, e = pcall(__datetimeIndex, __datetime, `UnixTimestampMillis\0{TAG}`)
assert(not s and e == "UnixTimestampMillis is not a valid member of DateTime", "[2] DateTime Index")

local utmilli = __datetimeIndex(__datetime, "UnixTimestampMillis")
assert(proxy:ToUniversalTime() and (utmilli == 0 or utmilli > 1787269570367), "[1] DateTime")

s, e2 = pcall(DateTime.fromUnixTimestamp, 253402300799.99997)
assert(s and type(e2) == "userdata" and typeof(e2) == "DateTime", "[1] DateTime.fromUnixTimestamp")
assert(__datetimeIndex(e2, "UnixTimestampMillis") == 253402300799000, "[1.1] DateTime.fromUnixTimestamp")

s, e = pcall(DateTime.fromUnixTimestamp, 253402300800)
assert(not s and type(e) == "string" and e == "Error interpreting timestamp as a precise point in time. Fields out of range. UnixTimestamp should be between -17987443200 and 253402300799.", "[2] DateTime.fromUnixTimestamp")

s, e = pcall(DateTime.fromUnixTimestamp, 253402300799)
assert(s and e == e2 and not rawequal(e, e2), "[3] DateTime.fromUnixTimestamp")

s, e = pcall(DateTime.fromUnixTimestampMillis, 253402300799999.97)
assert(s and e ~= e2 and not rawequal(e, e2), "[1] DateTime.fromUnixTimestampMillis")
assert(__datetimeIndex(e, "UnixTimestampMillis") == 253402300799999, "[1.1] fromUnixTimestampMillis")

s, e = pcall(DateTime.fromUnixTimestampMillis, 253402300800000)
assert(not s and type(e) == "string" and e == "Error interpreting timestampMillis as a precise point in time. Fields out of range. UnixTimestampMillis should be between -17987443200000 and 253402300799999.", "[2] DateTime.fromUnixTimestampMillis")

local fromUniversalTime: any = DateTime.fromUniversalTime
local zeroTime = DateTime.fromUnixTimestamp(-17987443200)
s, e = pcall(fromUniversalTime, 1399.9999999999998)
assert(not s and e == "Error interpreting year, month, day, hour, minute, second as a precise point in time. Fields out of range.", "[1] DateTime.fromUniversalTime")
s, e = pcall(fromUniversalTime, 1400)
assert(s and e == zeroTime and not rawequal(e, zeroTime), "[1.1] DateTime.fromUniversalTime")
if isOnPc then
    s, e = pcall(fromUniversalTime, 1400, 1, 1, 0, math.nan, math.nan, math.nan)
    assert(s and tostring(e) == "113009057180516", "[1.2] DateTime.fromUniversalTime")
    s, e = pcall(fromUniversalTime, 5415, 1, 7, 0, INT_MAX, math.nan, math.nan)
    assert(s and tostring(e) == "-17987354919483", "[1.3] DateTime.fromUniversalTime")
    s, e = pcall(fromUniversalTime, 5415, 1, 7, 0, INT_MAX + 1, math.nan, math.nan)
    assert(s and tostring(e) == "239710682780516", "[1.4] DateTime.fromUniversalTime")
    s, e = pcall(fromUniversalTime, 1400, 1, 1, 0, INT_MAX + 1, math.nan, math.nan)
    assert(s and tostring(e) == "113009057180516", "[1.5] DateTime.fromUniversalTime")
    s, e = pcall(fromUniversalTime, 1400, 1, 1, 0, -math.huge, math.nan, math.nan)
    assert(s and tostring(e) == "113009057180516", "[1.6] DateTime.fromUniversalTime")
    s, e = pcall(fromUniversalTime, 5848, 11, 20, 5, -math.huge, math.nan, math.nan)
    assert(s and tostring(e) == "253402299980516", "[1.7] DateTime.fromUniversalTime")
    s, e = pcall(fromUniversalTime, 5848, 11, 20, 4, -math.huge, math.nan, math.nan)
    assert(not s and type(e) == "string" and e == "Over the max DateTime supported: 9999-12-31T23:59:59Z", "[1.8] DateTime.fromUniversalTime")
    s, e = pcall(fromUniversalTime, 1400, 1, 1, math.nan, math.nan, math.nan, math.nan)
    assert(not s and type(e) == "string" and e == "Over the max DateTime supported: 9999-12-31T23:59:59Z", "[1.9] DateTime.fromUniversalTime")
    s, e = pcall(fromUniversalTime, 1400, 1, 1, 0, -35791358.99999999, math.nan, math.nan)
    assert(s and tostring(e) == "-17987443179483", "[1.10] DateTime.fromUniversalTime")
    s, e = pcall(fromUniversalTime, 1400, 1, 1, 0, -35791359, math.nan, math.nan)
    assert(not s and type(e) == "string" and e == "Below the min DateTime supported: 1400-01-01T00:00:00Z", "[1.10] DateTime.fromUniversalTime")
end

local localTime = __datetimeNC(__datetime)
assert(type(localTime) == "table" and not getmetatable(localTime), "[1] DateTime:ToUniversalTime()")

e2 = localTime.Millisecond
assert(type(e2) == "number" and e2 >= 0 and e2 <= 1000 and e2 // 1 == e2, "[2.1] DateTime:ToUniversalTime()")

e2 = localTime.Second
assert(type(e2) == "number" and e2 >= 0 and e2 <= 60 and e2 // 1 == e2, "[2.2] DateTime:ToUniversalTime()")

e2 = localTime.Minute
assert(type(e2) == "number" and e2 >= 0 and e2 <= 60 and e2 // 1 == e2, "[2.3] DateTime:ToUniversalTime()")

e2 = localTime.Hour
assert(type(e2) == "number" and e2 >= 0 and e2 <= 24 and e2 // 1 == e2, "[2.4] DateTime:ToUniversalTime()")

e2 = localTime.Day
assert(type(e2) == "number" and e2 >= 1 and e2 <= 31 and e2 // 1 == e2, "[2.5] DateTime:ToUniversalTime()")

e2 = localTime.Month
assert(type(e2) == "number" and e2 >= 1 and e2 <= 12 and e2 // 1 == e2, "[2.6] DateTime:ToUniversalTime()")

e2 = localTime.Year
assert(type(e2) == "number" and e2 >= 1970 and e2 <= 9999 and e2 // 1 == e2, "[2.7] DateTime:ToUniversalTime()")

local limDt = DateTime.fromUnixTimestamp(253402300799.99997)
s, e = pcall(__datetimeNC, limDt)
assert(s and type(e) == "table" and not getmetatable(e), "[3] DateTime:ToUniversalTime()")
assert(e.Millisecond == 0 and e.Second == 59 and e.Minute == 59 and e.Hour == 23 and e.Day == 31 and e.Month == 12 and e.Year == 9999, "[3.1] DateTime:ToUniversalTime()")

proxy:ToLocalTime()
s, e = pcall(__datetimeNC, limDt)
assert(s and (e.Millisecond == 0 and e.Second == 59 and e.Minute == 59 and e.Hour == 23 and e.Day == 31 and e.Month == 12 and e.Year == 9999) or e == "Over the max DateTime supported: 9999-12-31T23:59:59Z", "[1] DateTime:ToLocalTime()")

assert(utf8.charpattern == "[\0-\127\194-\244][\128-\191]*", "utf8.charpattern")

s, e = pcall(utf8.len, TAG, INT_MAX, -math.huge)
assert(not s and type(e) == "string" and e == "invalid argument #2 to 'len' (initial position out of string)", "[1] utf8.len")

s, e = pcall(utf8.len, TAG, 0, -math.huge)
assert(not s and type(e) == "string" and e == "invalid argument #2 to 'len' (initial position out of string)", "[1.1] utf8.len")

s, e = pcall(utf8.len, TAG, 1, -math.huge)
assert(s and e == 0, "[2] utf8.len")

if isOnPc then
    s, e = pcall(utf8.len, TAG, 1, math.huge)
    assert(s and e == 0, "[2.1] utf8.len")

    s, e = pcall(utf8.len, TAG, 1, INT_MAX + 1)
    assert(s and e == 0, "[2.2] utf8.len")
end

s, e = pcall(utf8.len, TAG, 1, math.nan)
assert(s and e == 0, "[2.3] utf8.len")

s, e = pcall(utf8.len, TAG, 1, INT_MAX)
assert(not s and type(e) == "string" and e == "invalid argument #3 to 'len' (final position out of string)", "[3] utf8.len")

local negZero = r4 ^ 2 // -math.huge
assert(negZero == 0 and rawequal(negZero, 0) and tostring(negZero) == "-0", "Luau Numbers")

s, e = pcall(math.abs, negZero)
assert(s and `{e}` == "0", "math.abs")

local rng = Random.new():NextNumber()

s, e, e2, e3 = pcall(utf8.codes, TAG)
_src, _line, _name, _pc, _va = debug.info(e, `slna\0f{TAG}`)
assert(_src == "[C]" and _line == -1 and _name == "" and _pc == 0 and _va == true, "[1] utf8.codes")

s, e2, e3 = pcall(e :: any, 0, -INT_MAX)
assert(s and e2 == 1 and e3 == 48, "[2] utf8.codes")
s, e2, e3 = pcall(e :: any, negZero, -INT_MAX)
assert(s and e2 == 1 and e3 == 45, "[2.1] utf8.codes")
s, e2, e3 = pcall(e :: any, negZero, 0)
assert(s and e2 == 1 and e3 == 45, "[2.2] utf8.codes")
if isOnPc then
    s, e2, e3 = pcall(e :: any, negZero, -INT_MAX - 1)
    assert(s and e2 == nil and e3 == nil, "[2.3] utf8.codes")
end
s, e2, e3 = pcall(e :: any, math.nan, 1)
assert(s and e2 == 2 and e3 == 97, "[2.4] utf8.codes")
s, e2, e3 = pcall(e :: any, math.nan, 0)
assert(s and e2 == 1 and e3 == 110, "[2.5] utf8.codes")
s, e2, e3 = pcall(e :: any, 0, 1)
assert(s and e2 == nil and e3 == nil, "[2.6] utf8.codes")
s, e2, e3 = pcall(e :: any, negZero, 1)
assert(s and e2 == 2 and e3 == 48, "[2.7] utf8.codes")
s, e2, e3 = pcall(e :: any, 0, 2)
assert(s and e2 == nil and e3 == nil, "[2.8] utf8.codes")
s, e2, e3 = pcall(e :: any, `{negZero}`, 1)
assert(s and e2 == 2 and e3 == 48, "[2.9] utf8.codes")
s, e2, e3 = pcall(e :: any, `\0\67\0{TAG}`, 1)
assert(s and e2 == 2 and e3 == 67, "[2.10] utf8.codes")
s, e2, e3 = pcall(e :: any, `\67\0{TAG}`, 1)
assert(s and e2 == 2 and e3 == 0, "[2.11] utf8.codes")
s, e2, e3 = pcall(e :: any, "\67", 1)
assert(s and e2 == nil and e3 == nil and proxy:Invoke(), "[2.12] utf8.codes")

local BF = Instance.new("BindableFunction")

function BF.OnInvoke(...)
    return ...
end

s, e = pcall(__instanceNC, BF, table.unpack(table.create(3999, 1)))
assert(not s and e == "Cannot create enough space in lua stack for bridging value", "[1] BindableFunction")

s, e = pcall(function()
    return select(`#{srep("\0", r4)}#{TAG}`, __instanceNC(BF, table.unpack(table.create(3998, 1)))), if rng <= 1 / 3 then proxy:service() elseif rng <= 2 / 3 then proxy:getService() else proxy:GetService()
end)
assert(s and e == 3998, "[2] BindableFunction")

assert(rawequal(workspace, Workspace), "[1] Instance Comparison")
assert(rawequal(game, Game), "[2] Instance Comparison")
assert(rawequal(game, __instanceIndex(workspace, "parent")), "[3] Instance Comparison")
assert(rawequal(__instanceNC(game, "Workspace"), __instanceNC(game, "Workspace")), "[4] Instance Comparison")

-- // Generated GetService Checks
;(function()
    proxy:service()
    s, e = pcall(__instanceNC, game, `object\0{TAG}`)
    assert(s and e == nil, "[1.1] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `capture\0{TAG}`)
    assert(s and e == nil, "[1.3] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `screenshotCapture\0{TAG}`)
    assert(not s and e == "'screenshotCapture' is not a valid Service name", "[1.4] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `videoCapture\0{TAG}`)
    assert(s and e == nil, "[1.5] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `editableImage\0{TAG}`)
    assert(s and e == nil, "[1.8] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `editableMesh\0{TAG}`)
    assert(s and e == nil, "[1.9] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `executedRemoteCommand\0{TAG}`)
    assert(not s and e == "'executedRemoteCommand' is not a valid Service name", "[1.10] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `instance\0{TAG}`)
    assert(s and e == nil, "[1.11] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `accountService\0{TAG}`)
    assert(not s and e == "'accountService' is not a valid Service name", "[1.13] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `accessory\0{TAG}`)
    assert(s and e == nil, "[1.15] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `achievementService\0{TAG}`)
    assert(not s and e == "'achievementService' is not a valid Service name", "[1.17] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `animation\0{TAG}`)
    assert(s and e == nil, "[1.23] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `animationClip\0{TAG}`)
    assert(s and e == nil, "[1.24] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `keyframeSequence\0{TAG}`)
    assert(s and e == nil, "[1.27] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `animationController\0{TAG}`)
    assert(not s and e == "'animationController' is not a valid Service name", "[1.29] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `animationRigData\0{TAG}`)
    assert(not s and e == "'animationRigData' is not a valid Service name", "[1.33] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `animationTrack\0{TAG}`)
    assert(s and e == nil, "[1.35] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `annotation\0{TAG}`)
    assert(s and e == nil, "[1.37] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `appUpdateService\0{TAG}`)
    assert(not s and e == "'appUpdateService' is not a valid Service name", "[1.43] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `assetCounterService\0{TAG}`)
    assert(not s and e == "'assetCounterService' is not a valid Service name", "[1.44] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `assetImportService\0{TAG}`)
    assert(not s and e == "'assetImportService' is not a valid Service name", "[1.46] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `bone\0{TAG}`)
    assert(not s and e == "'bone' is not a valid Service name", "[1.53] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `auroraScriptObject\0{TAG}`)
    assert(not s and e == "'auroraScriptObject' is not a valid Service name", "[1.81] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `auroraService\0{TAG}`)
    assert(not s and e == "'auroraService' is not a valid Service name", "[1.83] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `avatarRules\0{TAG}`)
    assert(s and e == nil, "[1.94] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `selfViewConfiguration\0{TAG}`)
    assert(not s and e == "'selfViewConfiguration' is not a valid Service name", "[1.101] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `rootImportData\0{TAG}`)
    assert(not s and e == "'rootImportData' is not a valid Service name", "[1.109] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `coreGui\0{TAG}`)
    assert(not s and e == "'coreGui' is not a valid Service name", "[1.111] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `starterGui\0{TAG}`)
    assert(not s and e == "'starterGui' is not a valid Service name", "[1.113] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `bodyAngularVelocity\0{TAG}`)
    assert(not s and e == "'bodyAngularVelocity' is not a valid Service name", "[1.125] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `bodyVelocity\0{TAG}`)
    assert(not s and e == "'bodyVelocity' is not a valid Service name", "[1.130] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `breakpoint\0{TAG}`)
    assert(s and e == nil, "[1.134] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `captureService\0{TAG}`)
    assert(not s and e == "'captureService' is not a valid Service name", "[1.144] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `skin\0{TAG}`)
    assert(not s and e == "'skin' is not a valid Service name", "[1.154] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `cloudCRUDService\0{TAG}`)
    assert(not s and e == "'cloudCRUDService' is not a valid Service name", "[1.159] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `collaborator\0{TAG}`)
    assert(not s and e == "'collaborator' is not a valid Service name", "[1.163] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `configuration\0{TAG}`)
    assert(s and e == nil, "[1.169] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `angularVelocity\0{TAG}`)
    assert(s and e == nil, "[1.175] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `hingeConstraint\0{TAG}`)
    assert(not s and e == "'hingeConstraint' is not a valid Service name", "[1.178] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `linearVelocity\0{TAG}`)
    assert(s and e == nil, "[1.180] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `planeConstraint\0{TAG}`)
    assert(not s and e == "'planeConstraint' is not a valid Service name", "[1.181] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `rodConstraint\0{TAG}`)
    assert(not s and e == "'rodConstraint' is not a valid Service name", "[1.184] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `torque\0{TAG}`)
    assert(s and e == nil, "[1.190] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `skateboardController\0{TAG}`)
    assert(s and e == nil, "[1.198] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `customEvent\0{TAG}`)
    assert(not s and e == "'customEvent' is not a valid Service name", "[1.215] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `customEventReceiver\0{TAG}`)
    assert(not s and e == "'customEventReceiver' is not a valid Service name", "[1.216] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `blockMesh\0{TAG}`)
    assert(not s and e == "'blockMesh' is not a valid Service name", "[1.220] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `dataModelPatchService\0{TAG}`)
    assert(not s and e == "'dataModelPatchService' is not a valid Service name", "[1.224] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `dataModelSession\0{TAG}`)
    assert(s and e == nil, "[1.225] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `dataStoreService\0{TAG}`)
    assert(not s and e == "'dataStoreService' is not a valid Service name", "[1.233] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `localDebuggerConnection\0{TAG}`)
    assert(not s and e == "'localDebuggerConnection' is not a valid Service name", "[1.240] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `deviceIdService\0{TAG}`)
    assert(not s and e == "'deviceIdService' is not a valid Service name", "[1.250] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `dialog\0{TAG}`)
    assert(s and e == nil, "[1.251] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `dialogChoice\0{TAG}`)
    assert(s and e == nil, "[1.252] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `displayWakeLock\0{TAG}`)
    assert(not s and e == "'displayWakeLock' is not a valid Service name", "[1.254] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `encodingService\0{TAG}`)
    assert(not s and e == "'encodingService' is not a valid Service name", "[1.260] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `experienceInviteOptions\0{TAG}`)
    assert(s and e == nil, "[1.265] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `experienceStateCaptureService\0{TAG}`)
    assert(not s and e == "'experienceStateCaptureService' is not a valid Service name", "[1.268] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `faceControls\0{TAG}`)
    assert(not s and e == "'faceControls' is not a valid Service name", "[1.275] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `faceInstance\0{TAG}`)
    assert(not s and e == "'faceInstance' is not a valid Service name", "[1.276] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `decal\0{TAG}`)
    assert(s and e == nil, "[1.277] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `texture\0{TAG}`)
    assert(s and e == nil, "[1.278] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `feature\0{TAG}`)
    assert(s and e == nil, "[1.284] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `motorFeature\0{TAG}`)
    assert(not s and e == "'motorFeature' is not a valid Service name", "[1.286] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `fire\0{TAG}`)
    assert(s and e == nil, "[1.291] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `floatCurve\0{TAG}`)
    assert(not s and e == "'floatCurve' is not a valid Service name", "[1.293] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `nonReplicatedCSGDictionaryService\0{TAG}`)
    assert(not s and e == "'nonReplicatedCSGDictionaryService' is not a valid Service name", "[1.296] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `folder\0{TAG}`)
    assert(s and e == nil, "[1.297] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `gamePassService\0{TAG}`)
    assert(not s and e == "'gamePassService' is not a valid Service name", "[1.302] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `generationService\0{TAG}`)
    assert(not s and e == "'generationService' is not a valid Service name", "[1.305] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `orderedDataStore\0{TAG}`)
    assert(not s and e == "'orderedDataStore' is not a valid Service name", "[1.312] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `guiObject\0{TAG}`)
    assert(s and e == nil, "[1.317] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `frame\0{TAG}`)
    assert(s and e == nil, "[1.319] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `scrollingFrame\0{TAG}`)
    assert(s and e == nil, "[1.328] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `textChannelWindow\0{TAG}`)
    assert(s and e == nil, "[1.330] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `layerCollector\0{TAG}`)
    assert(s and e == nil, "[1.334] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `pluginGui\0{TAG}`)
    assert(s and e == nil, "[1.336] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `adGui\0{TAG}`)
    assert(s and e == nil, "[1.342] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `guiBase3d\0{TAG}`)
    assert(not s and e == "'guiBase3d' is not a valid Service name", "[1.344] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `floorWire\0{TAG}`)
    assert(not s and e == "'floorWire' is not a valid Service name", "[1.345] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `handleAdornment\0{TAG}`)
    assert(not s and e == "'handleAdornment' is not a valid Service name", "[1.349] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `cylinderHandleAdornment\0{TAG}`)
    assert(not s and e == "'cylinderHandleAdornment' is not a valid Service name", "[1.352] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `parabolaAdornment\0{TAG}`)
    assert(not s and e == "'parabolaAdornment' is not a valid Service name", "[1.358] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `hapticService\0{TAG}`)
    assert(not s and e == "'hapticService' is not a valid Service name", "[1.372] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `humanoid\0{TAG}`)
    assert(s and e == nil, "[1.384] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `humanoidDescription\0{TAG}`)
    assert(s and e == nil, "[1.385] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `inputObject\0{TAG}`)
    assert(s and e == nil, "[1.398] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `internalMessagingService\0{TAG}`)
    assert(not s and e == "'internalMessagingService' is not a valid Service name", "[1.403] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `jointInstance\0{TAG}`)
    assert(not s and e == "'jointInstance' is not a valid Service name", "[1.407] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `rotateP\0{TAG}`)
    assert(not s and e == "'rotateP' is not a valid Service name", "[1.409] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `manualWeld\0{TAG}`)
    assert(not s and e == "'manualWeld' is not a valid Service name", "[1.414] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `snap\0{TAG}`)
    assert(not s and e == "'snap' is not a valid Service name", "[1.418] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `keyboardService\0{TAG}`)
    assert(not s and e == "'keyboardService' is not a valid Service name", "[1.422] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `keyframe\0{TAG}`)
    assert(s and e == nil, "[1.423] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `light\0{TAG}`)
    assert(s and e == nil, "[1.427] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `lighting\0{TAG}`)
    assert(s and e == nil, "[1.431] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `localStorageService\0{TAG}`)
    assert(not s and e == "'localStorageService' is not a valid Service name", "[1.435] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `logService\0{TAG}`)
    assert(not s and e == "'logService' is not a valid Service name", "[1.444] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `script\0{TAG}`)
    assert(s and e == nil, "[1.451] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `localScript\0{TAG}`)
    assert(not s and e == "'localScript' is not a valid Service name", "[1.452] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `luaWebService\0{TAG}`)
    assert(not s and e == "'luaWebService' is not a valid Service name", "[1.454] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `luauExpressionService\0{TAG}`)
    assert(not s and e == "'luauExpressionService' is not a valid Service name", "[1.455] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `makeupDescription\0{TAG}`)
    assert(not s and e == "'makeupDescription' is not a valid Service name", "[1.459] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `matchmakingService\0{TAG}`)
    assert(not s and e == "'matchmakingService' is not a valid Service name", "[1.462] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `materialVariant\0{TAG}`)
    assert(s and e == nil, "[1.465] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `memStorageConnection\0{TAG}`)
    assert(not s and e == "'memStorageConnection' is not a valid Service name", "[1.466] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `memoryStoreSortedMap\0{TAG}`)
    assert(not s and e == "'memoryStoreSortedMap' is not a valid Service name", "[1.472] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `message\0{TAG}`)
    assert(s and e == nil, "[1.473] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `metaBreakpoint\0{TAG}`)
    assert(not s and e == "'metaBreakpoint' is not a valid Service name", "[1.478] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `mouse\0{TAG}`)
    assert(s and e == nil, "[1.483] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `networkReplicator\0{TAG}`)
    assert(not s and e == "'networkReplicator' is not a valid Service name", "[1.492] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `part\0{TAG}`)
    assert(s and e == nil, "[1.507] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `meshPart\0{TAG}`)
    assert(s and e == nil, "[1.516] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `intersectOperation\0{TAG}`)
    assert(not s and e == "'intersectOperation' is not a valid Service name", "[1.518] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `camera\0{TAG}`)
    assert(s and e == nil, "[1.523] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `model\0{TAG}`)
    assert(s and e == nil, "[1.525] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `hopperBin\0{TAG}`)
    assert(not s and e == "'hopperBin' is not a valid Service name", "[1.528] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `tool\0{TAG}`)
    assert(s and e == nil, "[1.529] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `status\0{TAG}`)
    assert(s and e == nil, "[1.532] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `workspace\0{TAG}`)
    assert(s and e == nil, "[1.534] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `dataStorePages\0{TAG}`)
    assert(not s and e == "'dataStorePages' is not a valid Service name", "[1.547] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `path\0{TAG}`)
    assert(s and e == nil, "[1.560] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `pausedState\0{TAG}`)
    assert(s and e == nil, "[1.565] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `pausedStateException\0{TAG}`)
    assert(not s and e == "'pausedStateException' is not a valid Service name", "[1.567] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `pinShortcutService\0{TAG}`)
    assert(not s and e == "'pinShortcutService' is not a valid Service name", "[1.572] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `player\0{TAG}`)
    assert(s and e == nil, "[1.579] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `players\0{TAG}`)
    assert(s and e == nil, "[1.589] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `pluginDebugService\0{TAG}`)
    assert(not s and e == "'pluginDebugService' is not a valid Service name", "[1.594] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `pluginGuiService\0{TAG}`)
    assert(not s and e == "'pluginGuiService' is not a valid Service name", "[1.596] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `pluginManagerInterface\0{TAG}`)
    assert(not s and e == "'pluginManagerInterface' is not a valid Service name", "[1.599] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `pose\0{TAG}`)
    assert(s and e == nil, "[1.609] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `bloomEffect\0{TAG}`)
    assert(not s and e == "'bloomEffect' is not a valid Service name", "[1.611] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `blurEffect\0{TAG}`)
    assert(not s and e == "'blurEffect' is not a valid Service name", "[1.612] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `colorGradingEffect\0{TAG}`)
    assert(not s and e == "'colorGradingEffect' is not a valid Service name", "[1.614] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `processInstancePhysicsService\0{TAG}`)
    assert(not s and e == "'processInstancePhysicsService' is not a valid Service name", "[1.619] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `realtimeMedia\0{TAG}`)
    assert(not s and e == "'realtimeMedia' is not a valid Service name", "[1.625] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `reflectionMetadata\0{TAG}`)
    assert(not s and e == "'reflectionMetadata' is not a valid Service name", "[1.627] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `reflectionMetadataEnums\0{TAG}`)
    assert(not s and e == "'reflectionMetadataEnums' is not a valid Service name", "[1.630] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `reflectionMetadataItem\0{TAG}`)
    assert(not s and e == "'reflectionMetadataItem' is not a valid Service name", "[1.633] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `reflectionMetadataMember\0{TAG}`)
    assert(not s and e == "'reflectionMetadataMember' is not a valid Service name", "[1.637] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `reflectionMetadataProperties\0{TAG}`)
    assert(not s and e == "'reflectionMetadataProperties' is not a valid Service name", "[1.638] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `remoteDebuggerServer\0{TAG}`)
    assert(not s and e == "'remoteDebuggerServer' is not a valid Service name", "[1.643] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `robloxSerializableInstance\0{TAG}`)
    assert(not s and e == "'robloxSerializableInstance' is not a valid Service name", "[1.653] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `robloxServerStorage\0{TAG}`)
    assert(not s and e == "'robloxServerStorage' is not a valid Service name", "[1.654] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `romarkService\0{TAG}`)
    assert(not s and e == "'romarkService' is not a valid Service name", "[1.658] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `screenshotHud\0{TAG}`)
    assert(not s and e == "'screenshotHud' is not a valid Service name", "[1.666] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `scriptContext\0{TAG}`)
    assert(not s and e == "'scriptContext' is not a valid Service name", "[1.673] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `scriptProfilerService\0{TAG}`)
    assert(not s and e == "'scriptProfilerService' is not a valid Service name", "[1.678] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `scriptRegistrationService\0{TAG}`)
    assert(not s and e == "'scriptRegistrationService' is not a valid Service name", "[1.679] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `selection\0{TAG}`)
    assert(s and e == nil, "[1.683] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `serializationService\0{TAG}`)
    assert(not s and e == "'serializationService' is not a valid Service name", "[1.691] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `serverScriptService\0{TAG}`)
    assert(not s and e == "'serverScriptService' is not a valid Service name", "[1.692] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `dataModel\0{TAG}`)
    assert(s and e == nil, "[1.695] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `sessionService\0{TAG}`)
    assert(not s and e == "'sessionService' is not a valid Service name", "[1.701] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `sound\0{TAG}`)
    assert(s and e == nil, "[1.713] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `assetSoundEffect\0{TAG}`)
    assert(not s and e == "'assetSoundEffect' is not a valid Service name", "[1.718] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `distortionSoundEffect\0{TAG}`)
    assert(not s and e == "'distortionSoundEffect' is not a valid Service name", "[1.720] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `reverbSoundEffect\0{TAG}`)
    assert(not s and e == "'reverbSoundEffect' is not a valid Service name", "[1.725] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `stackFrame\0{TAG}`)
    assert(s and e == nil, "[1.732] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `starterPack\0{TAG}`)
    assert(not s and e == "'starterPack' is not a valid Service name", "[1.736] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `stats\0{TAG}`)
    assert(s and e == nil, "[1.741] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `statsItem\0{TAG}`)
    assert(not s and e == "'statsItem' is not a valid Service name", "[1.742] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `stopWatchReporter\0{TAG}`)
    assert(not s and e == "'stopWatchReporter' is not a valid Service name", "[1.747] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `studioAttachment\0{TAG}`)
    assert(not s and e == "'studioAttachment' is not a valid Service name", "[1.750] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `studioCallout\0{TAG}`)
    assert(not s and e == "'studioCallout' is not a valid Service name", "[1.751] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `studioData\0{TAG}`)
    assert(not s and e == "'studioData' is not a valid Service name", "[1.754] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `studioPublishService\0{TAG}`)
    assert(not s and e == "'studioPublishService' is not a valid Service name", "[1.759] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `studioService\0{TAG}`)
    assert(not s and e == "'studioService' is not a valid Service name", "[1.763] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `studioWidgetsService\0{TAG}`)
    assert(not s and e == "'studioWidgetsService' is not a valid Service name", "[1.767] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `styleBase\0{TAG}`)
    assert(s and e == nil, "[1.768] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `styleSheet\0{TAG}`)
    assert(s and e == nil, "[1.770] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `styleDerive\0{TAG}`)
    assert(not s and e == "'styleDerive' is not a valid Service name", "[1.771] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `stylingService\0{TAG}`)
    assert(not s and e == "'stylingService' is not a valid Service name", "[1.774] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `surfaceAppearance\0{TAG}`)
    assert(s and e == nil, "[1.775] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `teleportOptions\0{TAG}`)
    assert(s and e == nil, "[1.785] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `textChannel\0{TAG}`)
    assert(s and e == nil, "[1.794] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `bubbleChatConfiguration\0{TAG}`)
    assert(not s and e == "'bubbleChatConfiguration' is not a valid Service name", "[1.797] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `channelTabsConfiguration\0{TAG}`)
    assert(not s and e == "'channelTabsConfiguration' is not a valid Service name", "[1.798] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `chatInputBarConfiguration\0{TAG}`)
    assert(not s and e == "'chatInputBarConfiguration' is not a valid Service name", "[1.799] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `textChatMessage\0{TAG}`)
    assert(s and e == nil, "[1.801] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `chatWindowMessageProperties\0{TAG}`)
    assert(not s and e == "'chatWindowMessageProperties' is not a valid Service name", "[1.804] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `textSource\0{TAG}`)
    assert(s and e == nil, "[1.810] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `textureGenerationPartGroup\0{TAG}`)
    assert(not s and e == "'textureGenerationPartGroup' is not a valid Service name", "[1.811] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `thirdPartyUserService\0{TAG}`)
    assert(not s and e == "'thirdPartyUserService' is not a valid Service name", "[1.814] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `trackerLodController\0{TAG}`)
    assert(not s and e == "'trackerLodController' is not a valid Service name", "[1.822] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `uITextSizeConstraint\0{TAG}`)
    assert(not s and e == "'uITextSizeConstraint' is not a valid Service name", "[1.837] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `vRService\0{TAG}`)
    assert(not s and e == "'vRService' is not a valid Service name", "[1.858] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `binaryStringValue\0{TAG}`)
    assert(s and e == nil, "[1.861] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `intConstrainedValue\0{TAG}`)
    assert(not s and e == "'intConstrainedValue' is not a valid Service name", "[1.867] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `videoPlayer\0{TAG}`)
    assert(not s and e == "'videoPlayer' is not a valid Service name", "[1.879] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `visit\0{TAG}`)
    assert(not s and e == "'visit' is not a valid Service name", "[1.885] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `visualizationModeService\0{TAG}`)
    assert(not s and e == "'visualizationModeService' is not a valid Service name", "[1.888] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `voiceChatService\0{TAG}`)
    assert(not s and e == "'voiceChatService' is not a valid Service name", "[1.890] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `weldConstraint\0{TAG}`)
    assert(not s and e == "'weldConstraint' is not a valid Service name", "[1.894] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `windowProtocolService\0{TAG}`)
    assert(not s and e == "'windowProtocolService' is not a valid Service name", "[1.895] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `wire\0{TAG}`)
    assert(s and e == nil, "[1.896] GetService/getService/service")
    s, e = pcall(__instanceNC, game, `wrapTextureTransfer\0{TAG}`)
    assert(s and e == nil, "[1.898] GetService/getService/service")
end)()

s, e = pcall(__instanceNC, game, `AuroraScriptObject\0{TAG}`)
assert(not s and e == "This type can not be instantiated", "[2] GetService/getService/service")
s, e = pcall(__instanceNC, game, `AuroraScript\0{TAG}`)
assert(not s and e == "This type can not be instantiated", "[2.1] GetService/getService/service")

s, e = pcall(__instanceNC, game, `DebugSettings\0{TAG}`)
assert(not s and e == "Invalid parent for Service. DebugSettings cannot be parented to Game .", "[3.1] GetService/getService/service")
s, e = pcall(__instanceNC, game, `GameSettings\0{TAG}`)
assert(not s and e == "Invalid parent for Service. GameSettings cannot be parented to Game .", "[3.2] GetService/getService/service")
s, e = pcall(__instanceNC, game, `ParabolaAdornment\0{TAG}`)
assert(not s and e == "ParabolaAdornment may only be instantiated by CoreScripts at this time", "[3.3] GetService/getService/service")
s, e = pcall(__instanceNC, game, `LuaSettings\0{TAG}`)
assert(not s and e == "Invalid parent for Service. LuaSettings cannot be parented to Game .", "[3.4] GetService/getService/service")
s, e = pcall(__instanceNC, game, `NetworkSettings\0{TAG}`)
assert(not s and e == "Invalid parent for Service. NetworkSettings cannot be parented to Game .", "[3.5] GetService/getService/service")
s, e = pcall(__instanceNC, game, `NetworkSettings\0{TAG}`)
assert(not s and e == "Invalid parent for Service. NetworkSettings cannot be parented to Game .", "[3.6] GetService/getService/service")
s, e = pcall(__instanceNC, game, `PhysicsSettings\0{TAG}`)
assert(not s and e == "Invalid parent for Service. PhysicsSettings cannot be parented to Game .", "[3.7] GetService/getService/service")
s, e = pcall(__instanceNC, game, `InternalSyncItem\0{TAG}`)
assert(not s and e == "Internal Permission is required for this feature.", "[3.8] GetService/getService/service")
s, e = pcall(__instanceNC, game, `RenderSettings\0{TAG}`)
assert(not s and e == "Invalid parent for Service. RenderSettings cannot be parented to Game .", "[3.9] GetService/getService/service")
s, e = pcall(__instanceNC, game, `SlimDebugSettings\0{TAG}`)
assert(not s and e == "Invalid parent for Service. SlimDebugSettings cannot be parented to Game .", "[3.10] GetService/getService/service")
s, e = pcall(__instanceNC, game, `TaskScheduler\0{TAG}`)
assert(not s and e == "Invalid parent for Service. TaskScheduler cannot be parented to Game .", "[3.11] GetService/getService/service")
s, e = pcall(__instanceNC, game, `UserGameSettings\0{TAG}`)
assert(not s and e == "Invalid parent for Service. UserGameSettings cannot be parented to Game .", "[3.12] GetService/getService/service")

s, e = pcall(__instanceNC, game, `NetworkServer\0{TAG}`)
assert(not s and e == "The current thread cannot create 'NetworkServer' (lacking capability RobloxEngine)", "[4.1] GetService/getService/service")
s, e = pcall(__instanceNC, game, `Player\0{TAG}`)
assert(not s and e == "The current thread cannot create 'Player' (lacking capability WritePlayer)", "[4.2] GetService/getService/service")

s, e2 = pcall(__instanceNC, game, `SerializationService\0{TAG}`)
assert(s and e, "[1] SerializationService")
s, e = pcall(print, e2)
assert(not s and e == "The current thread cannot access 'SerializationService' (lacking capability PluginOrOpenCloud)", "[2] SerializationService")
s, e = pcall(warn, e2)
assert(not s and e == "The current thread cannot access 'SerializationService' (lacking capability PluginOrOpenCloud)", "[2.1] SerializationService")
s, e = pcall(tostring, e2)
assert(not s and e == "The current thread cannot access 'SerializationService' (lacking capability PluginOrOpenCloud)", "[2.2] SerializationService")
s, e = pcall(proxy:GetChildren() and __instanceNC, e2)
assert(s and type(e) == "table" and #e == 0 and not next(e), "[3] SerializationService")
s, e = pcall(proxy:getChildren() and __instanceNC, e2)
assert(not s and e == "The current thread cannot access 'SerializationService' (lacking capability PluginOrOpenCloud)", "[3.1] SerializationService")
s, e = pcall(proxy:IsA() and __instanceNC, e2, "SerializationService")
assert(s and e == true, "[3.2] SerializationService")
s, e = pcall(proxy:isA() and __instanceNC, e2)
assert(not s and e == "The current thread cannot access 'SerializationService' (lacking capability PluginOrOpenCloud)", "[3.3] SerializationService")
s, e = pcall(proxy:FindFirstChild() and __instanceNC, e2, TAG)
assert(s and e == nil, "[3.4] SerializationService")
s, e = pcall(proxy:findFirstChild() and __instanceNC, e2)
assert(not s and e == "The current thread cannot access 'SerializationService' (lacking capability PluginOrOpenCloud)", "[3.5] SerializationService")
s, e = pcall(proxy:IsDescendantOf() and __instanceNC, e2, game)
assert(s and e == true, "[3.6] SerializationService")
s, e = pcall(proxy:isDescendantOf() and __instanceNC, e2)
assert(not s and e == "The current thread cannot access 'SerializationService' (lacking capability PluginOrOpenCloud)", "[3.7] SerializationService")
s, e = pcall(proxy:FindFirstChildWhichIsA() and __instanceNC, e2, "SerializationService")
assert(s and e == nil, "[3.8] SerializationService")
s, e = pcall(proxy:findFirstChildWhichIsA() and __instanceNC, e2, "SerializationService")
assert(s and e == nil, "[3.9] SerializationService")
s, e = pcall(proxy:Clone() and __instanceNC, e2)
assert(not s and e == "The current thread cannot access 'SerializationService' (lacking capability PluginOrOpenCloud)", "[3.10] SerializationService")
s, e = pcall(proxy:clone() and __instanceNC, e2)
assert(not s and e == "The current thread cannot access 'SerializationService' (lacking capability PluginOrOpenCloud)", "[3.11] SerializationService")
s, e = pcall(proxy:Destroy() and __instanceNC, e2)
assert(not s and e == "The current thread cannot access 'SerializationService' (lacking capability PluginOrOpenCloud)", "[3.12] SerializationService")
s, e = pcall(proxy:destroy() and __instanceNC, e2)
assert(not s and e == "The current thread cannot access 'SerializationService' (lacking capability PluginOrOpenCloud)", "[3.13] SerializationService")
s, e = pcall(proxy:Remove() and __instanceNC, e2)
assert(not s and e == "The current thread cannot access 'SerializationService' (lacking capability PluginOrOpenCloud)", "[3.14] SerializationService")
s, e = pcall(proxy:remove() and __instanceNC, e2)
assert(not s and e == "The current thread cannot access 'SerializationService' (lacking capability PluginOrOpenCloud)", "[3.15] SerializationService")
s, e = pcall(proxy:children() and __instanceNC, e2)
assert(not s and e == "The current thread cannot access 'SerializationService' (lacking capability PluginOrOpenCloud)", "[3.16] SerializationService")
s, e = pcall(proxy:serializeInstancesAsync() and __instanceNC, e2)
assert(not s and e == "The current thread cannot access 'SerializationService' (lacking capability PluginOrOpenCloud)", "[3.17] SerializationService")
s, e = pcall(proxy:FireServer() and __instanceNC, e2)
assert(not s and e == "FireServer is not a valid member of SerializationService \"SerializationService\"", "[3.19] SerializationService")
s, e = pcall(__instanceIndex, e2, "name")
assert(s and e == "SerializationService", "[4] SerializationService")
s, e = pcall(__instanceNI, e2, `Name\0{TAG}`, TAG)
assert(not s and e == "The current thread cannot access 'SerializationService' (lacking capability PluginOrOpenCloud)", "[5] SerializationService")

s, e = pcall(proxy:isA() and Instance.new, `SurfaceGui\0{TAG}`)
assert(s
   and e
   and type(e) == "userdata"
   and typeof(e) == "Instance"
   and __instanceNC(e, "SurfaceGui")
   and __instanceNC(e, "SurfaceGuiBase")
   and __instanceNC(e, "LayerCollector")
   and __instanceNC(e, "GuiBase2d")
   and __instanceNC(e, "GuiBase")
   and __instanceNC(e, "Instance")
   and __instanceNC(e, "Object")
   and not __instanceNC(e, TAG), "SurfaceGui Type")

s, e = pcall(__instanceNC, game, TAG)
assert(s and e == false, proxy:service() and "IsA")

s, e2 = pcall(__instanceNC, __instanceIndex(__instanceNC(game, "Players"), "localPlayer"), proxy:getMouse())
assert(proxy:isA()
   and s
   and e2
   and type(e2) == "userdata"
   and typeof(e2) == "Instance"
   and __instanceNC(e2, "PlayerMouse")
   and __instanceNC(e2, "Mouse")
   and __instanceNC(e2, "Instance")
   and __instanceNC(e2, "Object")
   and not __instanceNC(e2, TAG), "PlayerMouse Type")
s, e = pcall(__instanceIndex, e2, "parent")
assert(s and e == nil, "[1] PlayerMouse")
s, e = pcall(__instanceIndex, e2, "name")
assert(s and e == "Instance", "[1.1] PlayerMouse")
s, e = pcall(__instanceIndex, e2, "unitRay")
assert(s and type(e) == "userdata" and typeof(e) == "Ray" and math.abs(vector.magnitude(e.Direction) - 1) <= 1e-6, "[1.2] PlayerMouse")
s, e = pcall(__instanceIndex, e2, "x")
assert(s and e == -1, "[1.3] PlayerMouse") -- These are the default values before game:IsLoaded()
s, e = pcall(__instanceIndex, e2, "y")
assert(s and e == -1, "[1.4] PlayerMouse")
s, e = pcall(__instanceIndex, e2, "viewSizeX")
assert(s and e == 800, "[1.5] PlayerMouse")
s, e = pcall(__instanceIndex, e2, "viewSizeY")
assert(s and e == 600, "[1.6] PlayerMouse")
s, e3 = pcall(Instance.new, `Part\0{TAG}`, e2, proxy:getFullName())
assert(s and __instanceNC(e3) == "Instance.Part", "[2] PlayerMouse")
s, e = pcall(__instanceNI, e2, "Parent", e3)
assert(not s and e == "The Parent property of Instance is locked, current parent: NULL, new parent Part", "[3] PlayerMouse")
s, e = pcall(__instanceNI, e2, "Name", `{TAG}\0{TAG}`)
assert(s and e == nil, "[3.1] PlayerMouse")
s, e = pcall(__instanceNC, e3)
assert(s and e == `{TAG}.Part`, "[3.2] PlayerMouse")

s, e = pcall(__instanceNI, proxy:service() and __instanceNC(game, "Players\0"), "localPlayer", 1)
assert(not s and e == "Unable to assign property localPlayer. Player expected, got number", "[7] Instance __newindex")
s, e = pcall(__instanceNI, e2, "hit", 1)
assert(not s and e == "Unable to assign property hit. CoordinateFrame expected, got number", "[7.1] Instance __newindex")
s, e = pcall(__instanceNI, e2, "target", 1)
assert(not s and e == "Unable to assign property target. BasePart expected, got number", "[7.2] Instance __newindex")
s, e = pcall(__instanceNI, e2, "name", 1)
assert(not s and e == `name is not a valid member of PlayerMouse "{TAG}"`, "[7.3] Instance __newindex")
s, e = pcall(__instanceNI, e2, "className", 1)
assert(not s and e == "Unable to assign property className. Property is read only", "[7.4] Instance __newindex")
s, e = pcall(__instanceNI, e2, "IsA", 1)
assert(not s and e == `IsA is not a valid member of PlayerMouse "{TAG}"`, "[7.5] Instance __newindex")
s, e = pcall(__instanceNI, e2, "Changed", 1)
assert(not s and e == `Changed is not a valid member of PlayerMouse "{TAG}"`, "[7.5] Instance __newindex")

s, e = pcall(__instanceNI, e2, "archivable", true)
assert(s and e == nil, "[8] Instance __newindex")
s, e = pcall(__instanceNI, e2, "archivable", nil)
assert(s and e == nil, "[8.1] Instance __newindex")
s, e = pcall(__instanceIndex, e2, "Archivable")
assert(s and e == false, "[8.2] Instance __newindex")
s, e = pcall(__instanceNI, e2, "archivable", game)
assert(s and e == nil, "[8.3] Instance __newindex")
s, e = pcall(__instanceIndex, e2, "Archivable")
assert(s and e == true, "[8.4] Instance __newindex")
s, e = pcall(__instanceNI, e2, "archivable", proxy)
assert(s and e == nil, "[8.5] Instance __newindex")
s, e = pcall(__instanceIndex, e2, "Archivable")
assert(s and e == true, "[8.6] Instance __newindex")
s, e = pcall(__instanceNI, e2, "archivable", e2)
assert(s and e == nil, "[8.7] Instance __newindex")
s, e = pcall(__instanceIndex, e2, "Archivable")
assert(s and e == true, "[8.8] Instance __newindex")

print("Success")