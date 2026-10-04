-- module-style chunk with a top-level return
local M = {}
M.version = "1.0.0"
local private = 42

function M.getPrivate()
  return private
end

function M.add(a: number, b: number): number
  return a + b
end

M.constants = { PI = 3.14159, E = 2.718 }

local function helper(x)
  return x * 2
end
M.doubled = helper(21)

print("module loaded", M.version, M.getPrivate())
return M
