/**
 * [[ VM specification ]]
 *
 * CursedVM™ is a 32-bit big-endian machine. It is incredibly ridiculously designed, mainly due to extreme sleep deprivation.
 * There are 32 registers and a stack, as well as a global environment.
 * External JS objects can be loaded through the global environment.
 * There is also a secondary "immediate re-use stack" (IRS), and a call stack which is not exposed to the VM.
 * CursedVM™ objects can have type null, int, float, ptr (pointer), or ext (external object).
 * Instructions are a fixed 4 bytes long.
 * Instructions are sorted into 16 instruction classes. The first 4 bits of each instruction signify the instruction class.
 *
 * The instruction classes are as follows:
 *  0. nop
 *    - nop
 *      Encoding: 0000S??? ???????? AAAAAAAA AAAAAAAA
 *        Does nothing. If S is set, A is sign-extended and pushed onto the IRS.
 *  1. exit
 *    - exit.i
 *      Encoding: 0001???0 ???????? AAAAAAAA AAAAAAAA
 *        Exits with signed exit value A.
 *    - exit.r
 *      Encoding: 0001???1 ???RRRRR ???????? ????????
 *        Exits with the value in register R.
 *  2. push
 *    - push.i
 *      Encoding: 0010???0 ???????? AAAAAAAA AAAAAAAA
 *        Sign-extends A, creates an integer object from it, and pushes the object onto the stack.
 *    - push.r
 *      Encoding: 0010S??1 ???RRRRR AAAAAAAA AAAAAAAA
 *        Pushes the object in register R onto the stack. If S is set, A is sign-extended and pushed onto the IRS.
 *  3. pop
 *    - pop
 *      Encoding: 0011S??0 ???RRRRR AAAAAAAA AAAAAAAA
 *        Pops an object from the stack into register R. If S is set, A is sign-extended and pushed onto the IRS.
 *    - ipop.int
 *      Encoding: 0011S?01 ???RRRRR AAAAAAAA AAAAAAAA
 *        Pops an int from the IRS into register R. If S is set, A is sign-extended and pushed onto the IRS after.
 *    - ipop.ptr
 *      Encoding: 0011S?11 ???RRRRR AAAAAAAA AAAAAAAA
 *        Pops a ptr from the IRS into register R. If S is set, A is sign-extended and pushed onto the IRS after.
 *  4. ret
 *    - ret
 *      Encoding: 0100S??? ???????? AAAAAAAA AAAAAAAA
 *        Returns from a subroutine. If S is set, A is sign-extended and pushed onto the IRS.
 *  5. env
 *    - get
 *      Encoding: 01010?00 ???YYYYY ???XXXXX ????????
 *        Gets a variable from the environment. X should be a register holding an int, float, or pointer to a string; the environment variable with that key will be loaded as a float into register Y, or null if no variable exists.
 *    - getp
 *      Encoding: 01010?01 ???YYYYY ???XXXXX ???ZZZZZ
 *        Gets a property on the external object in register Z and stores it as a float in register Y, or null if no variable exists. X should be a holding an int, float, or pointer to a string.
 *    - load
 *      Encoding: 01010?10 ???YYYYY ???XXXXX ????????
 *        Loads a variable from the environment. X should be a register holding an int, float, or pointer to a string; the environment variable with that key will be loaded as an external object into register Y, or null if no variable exists.
 *        External objects are currently only useful for calling JS functions from the VM, which can be done using the call.r instruction.
 *    - loadp
 *      Encoding: 01010?11 ???YYYYY ???XXXXX ???ZZZZZ
 *        Gets a property on the external object in register Z and stores it as an external object in register Y.
 *    - set
 *      Encoding: 01011??0 ???YYYYY ???XXXXX ????????
 *        Sets an environment variable. X should be a register holding an int, float, or pointer to a string. That key in the environment will be set to the value of register Y.
 *    - setp
 *      Encoding: 01011??1 ???YYYYY ???XXXXX ???ZZZZZ
 *        Sets a property on the external object in register Z. X should be a register holding an int, float, or pointer to a string. That property will be set to the value of register Y.
 *  6. b
 *    - b.i
 *      Encoding: 0110?000 0??????? AAAAAAAA AAAAAAAA
 *        Sign-extends A and branches that many instructions from the current instruction. b.i 1 does nothing, whereas b.i 0 is an infinite loop.
 *    - b.r
 *      Encoding: 0110S001 0??RRRRR AAAAAAAA AAAAAAAA
 *        Same as b.i, but branches according to the value of the register R. R must be an integer. If S is set, A is sign-extended and pushed onto the IRS.
 *    - b.abs.i
 *      Encoding: 0110?010 0??????? AAAAAAAA AAAAAAAA
 *        Same as b.i, but an absolute jump. Branches to the given offset in memory.
 *    - b.abs.r
 *      Encoding: 0110S011 0??RRRRR AAAAAAAA AAAAAAAA
 *        Same as b.abs.i, but jumps according to the value of the register R. R must be an integer or a pointer. If S is set, A is sign-extended and pushed onto the IRS.
 *    - call.i
 *      Encoding: 0110S110 0??????? AAAAAAAA AAAAAAAA
 *        Same as b.abs.i, but calls a subroutine.
 *    - call.r
 *      Encoding: 0110S111 0??RRRRR AAAAAAAA AAAAAAAA
 *        Same as b.abs.r, but calls a subroutine. If R is an external object instead of an integer or pointer, it will call the external JS function associated with it.
 *        Calling external functions works differently depending on whether the function is an instance of VMEnvFunction or not. If it is, the function is called with the VM objects that are on the stack. If a regular JS function is being called instead, the first object on the stack must be an int holding the number of arguments to pop off the stack. After that object, that many objects are popped off the stack, and their values (or in the case of ptrs, strings) are passed to the function.
 *        The return value of the function is then pushed to the stack as an external object, or null if undefined.
 *    - bc.i
 *      Encoding: 0110?000 1??????? AAAAAAAA AAAAAAAA
 *        Same as b.i, but only branches if comparison result register is non-zero.
 *    - bc.r
 *      Encoding: 0110S001 1??RRRRR AAAAAAAA AAAAAAAA
 *        Same as b.r, but only branches if comparison result register is non-zero.
 *    - bc.abs.i
 *      Encoding: 0110?010 1??????? AAAAAAAA AAAAAAAA
 *        Same as b.abs.i, but only branches if comparison result register is non-zero.
 *    - bc.abs.r
 *      Encoding: 0110S011 1??RRRRR AAAAAAAA AAAAAAAA
 *        Same as b.abs.r, but only branches if comparison result register is non-zero.
 *    - callc.i
 *      Encoding: 0110S110 1??????? AAAAAAAA AAAAAAAA
 *        Same as call.i, but only calls if comparison result register is non-zero.
 *    - callc.r
 *      Encoding: 0110S111 1??RRRRR AAAAAAAA AAAAAAAA
 *        Same as call.r, but only calls if comparison result register is non-zero.
 *  7. cmp
 *    - c.METHOD.i
 *      Encoding: 0111SCCC ??0XXXXX AAAAAAAA AAAAAAAA
 *        Compares the values of register X and the sign-extended value A, and writes the result to the designated comparison result register.
 *        The comparison method is based on the value C:
 *          - 000: c.cmp.i;  returns -1 if X < A, 0 if X == A, 1 if X > A
 *          - 001: c.eq.i;   returns 1 if X == A, 0 otherwise
 *          - 010: c.lt.i;   returns 1 if X < A, 0 otherwise
 *          - 011: c.gt.i;   returns 1 if X > A, 0 otherwise
 *          - 100: c.not;    returns 1 if X == 0, 0 otherwise. If S is set, A is sign-extended and pushed onto the IRS.
 *          - 101: c.neq.i;  returns 1 is X != A, 0 otherwise
 *          - 110: c.gte.i;  returns 1 if X >= A, 0 otherwise
 *          - 111: c.lte.i;  returns 1 if X <= A, 0 otherwise
 *    - c.METHOD.r
 *      Encoding: 0111?CCC ??1XXXXX ???YYYYY ???ZZZZZ
 *        The idea is the same as c.METHOD.i, but comparing with the value of register Z instead of an immediate.
 *        The result of the comparison is written to register Y.
 *        Comparison methods:
 *          - 000: c.cmp.r;  returns -1 if X < Z, 0 if X == Z, 1 if X > Z
 *          - 001: c.eq.r;   returns 1 if X == Z, 0 otherwise
 *          - 010: c.lt.r;   returns 1 if X < Z, 0 otherwise
 *          - 011: c.null;   returns 1 if X is null, 0 otherwise
 *          - 100: c.same;   returns 1 if X and Z contain the same object, 0 otherwise
 *          - 101: c.neq.r;  returns 1 is X != Z, 0 otherwise
 *          - 110: c.gte.r;  returns 1 if X >= Z, 0 otherwise
 *          - 111: c.nnull;  returns 1 if X is not null, 0 otherwise
 *  8. cvt
 *    - cvt.TYPE.i
 *      Encoding: 1000STTT ??0YYYYY AAAAAAAA AAAAAAAA
 *        Sign-extend A, convert it to an object with type T, and store the object in register Y.
 *        Type codes:
 *          - 000: null; sets Y to a new null object. If S is set, A is sign-extended and pushed onto the IRS.
 *          - 001: int
 *          - 010: float
 *          - 011: ptr
 *          - 100: ext (error)
 *          - 101: reserved (error)
 *          - 110: reserved (error)
 *          - 111: reserved (error)
 *    - cvt.TYPE.r
 *      Encoding: 10000TTT ??1YYYYY ???????? ???XXXXX
 *        Convert the value in register X to an object with type T, and store it in register Y.
 *        Type codes:
 *          - 000: null; sets Y to a new null object.
 *          - 001: int
 *          - 010: float (error if X is ptr)
 *          - 011: ptr (error if X is float)
 *          - 100: ext (error)
 *          - 101: reserved (error)
 *          - 110: reserved (error)
 *          - 111: reserved (error)
 *    - repr.FROM.TO
 *      Encoding: 10001TTT ??1YYYYY ???00FFF ???XXXXX
 *        Reinterpret the value in register X as type F, and convert it to type T and store in register Y.
 *        Reinterpretation of X is not possible unless X is of type int, float, or ptr, and F is 001 (int), 010 (float), or 011 (ptr).
 *        Type codes:
 *          - 000: null; sets Y to a new null object.
 *          - 001: int
 *          - 010: float
 *          - 011: ptr
 *          - 100: ext (error)
 *          - 101: reserved (error)
 *          - 110: reserved (error)
 *          - 111: reserved (error)
 *  9. num
 *    - add[.f]
 *      Encoding: 1001T000 ???ZZZZZ ???XXXXX ???YYYYY
 *        Add the value in Y to the value in X, and store the result in Z.
 *        Order matters for this operation; Z takes the type of X unless T is set.
 *        If X and Y are not both int, float, or ptr, an error is thrown.
 *        If Y is a ptr and X is not a ptr, an error is thrown. If X is a ptr and Y is a float, an error is thrown.
 *        If T is set, the result is computed as a float even if X is an int. However, if X is a ptr, an error is thrown.
 *    - sub[.f]
 *      Encoding: 1001T001 ???ZZZZZ ???XXXXX ???YYYYY
 *        Same as add, but subtracts Y from X.
 *    - mult[.f]
 *      Encoding: 1001T010 ???ZZZZZ ???XXXXX ???YYYYY
 *        Multiply the value in X and the value in Y, and store the result in Z.
 *        If T is set, the result is computed as a float. Otherwise, the result is computed as an int.
 *    - div[.f]
 *      Encoding: 1001T011 ???ZZZZZ ???XXXXX ???YYYYY
 *        Same as mult.TYPE, but divides X and Y.
 *    - mod[.f]
 *      Encoding: 1001T100 ???ZZZZZ ???XXXXX ???YYYYY
 *        Same as mult.TYPE, but computes the modulo of X and Y.
 *    - and
 *      Encoding: 10010101 ???ZZZZZ ???XXXXX ???YYYYY
 *        Computes the bitwise AND of X and Y, and stores the result in Z.
 *        X and Y must be integers.
 *    - or
 *      Encoding: 10011101 ???ZZZZZ ???XXXXX ???YYYYY
 *        Same as and.TYPE, but computes the bitwise OR of X and Y.
 *    - xor
 *      Encoding: 10010110 ???ZZZZZ ???XXXXX ???YYYYY
 *        Same as and.TYPE, but computes the bitwise XOR of X and Y.
 *    - xnor
 *      Encoding: 10011110 ???ZZZZZ ???XXXXX ???YYYYY
 *        Same as and.TYPE, but computes the bitwise XNOR of X and Y.
 *    - shl
 *      Encoding: 10010111 ???ZZZZZ ???XXXXX ???YYYYY
 *        Same as and.TYPE, but computes X shifted left by Y bits.
 *    - shr
 *      Encoding: 10011111 ???ZZZZZ ???XXXXX ???YYYYY
 *        Same as and.TYPE, but computes X shifted right by Y bits. The sign bit is extended into the number.
 *  10. mem
 *    - read.TYPE
 *      Encoding: 10100TTT ???ZZZZZ ???XXXXX ???YYYYY
 *        Read an object from the ptr in register X with offset Y and store it in register Z.
 *        If X doesn't point to the stack (i.e. points to int-only memory), the result is reinterpreted from type int as type T.
 *        Y must be an int or a ptr.
 *    - write
 *      Encoding: 10101??? ???ZZZZZ ???XXXXX ???YYYYY
 *        Write the object in register Z to the ptr in register X with offset Y.
 *        If X doesn't point to the stack (i.e. points to int-only memory), Z must be an int, float, or ptr.
 *        Y must be an int or a ptr.
 *  11. reserved
 *  12. reserved
 *  13. reserved
 *  14. reserved
 *  15. sys
 *    - dbg
 *      Encoding: 11110??0 ???????? ???????? ????????
 *        Do a debug print of the VM state to the console.
 *    - dbgp
 *      Encoding: 11110??1 ???XXXXX ???????? ????????
 *        Print register X to the console.
 *    - break
 *      Encoding: 11111??? ???????? ???????? ????????
 *        Same as dbg, but pause execution.
 *
 * You may notice many basic things are missing, such as adding numbers, or writing to memory. This is because I'm lazy.
 * It *might* actually be Turing-complete in its current state, since the control flow is quite capable. I'm not sure.
 *
 * Special registers:
 *  - Register 0 ($ZERO) contains an int object with value 0. It is read-only.
 *  - Register 1 ($COMP) is the comparison result register.
 *  - Register 2 ($PC) is the program counter. It is a read-only pointer.
 *  - Registers 24 ($P0) and 25 ($P1) are preserved registers. Their values are preserved across VM resets.
 *  - Register 26 ($IRSP) is the IRS pointer. The IRS is segregated from main memory.
 *  - Register 27 ($IPOP) is the IRS pop register. It is read-only, and has special behavior; when read from, it pops an object from the IRS and returns it.
 *  - Register 28 ($IPTR) is the IRS pointer pop register. It's the same as $IPOP, but returns a ptr.
 *  - Register 29 ($SP) is the stack pointer. The stack is segregated from main memory.
 *  - Register 30 ($PUSH) is the stack push register. When an object is written to it, it pushes that object onto the stack.
 *  - Register 31 ($POP) is the stack pop register. It is read-only, and has special behavior; when read from, it pops an object from the stack and returns it.
 */

const DEBUG = false

function debug(...args) {
	if (DEBUG) {
		console.log(...args)
	}
}

class VMError extends Error {
	constructor(message, ...params) {
		super(message, ...params)
		
		this.name = this.constructor.name
	}
}

class VMObject {
	static TYPE_NULL  = 0b000
	static TYPE_INT   = 0b001
	static TYPE_FLOAT = 0b010
	static TYPE_PTR   = 0b011
	static TYPE_EXT   = 0b100
	
	static TYPE_NAME_TABLE = {
		[VMObject.TYPE_NULL]:  "null",
		[VMObject.TYPE_INT]:   "int",
		[VMObject.TYPE_FLOAT]: "float",
		[VMObject.TYPE_PTR]:   "ptr",
		[VMObject.TYPE_EXT]:   "ext"
	}

	static getTypeName(type) {
		let name = VMObject.TYPE_NAME_TABLE[type]

		if (name) {
			return name
		} else {
			return type.toString(2).padStart(3, "0")
		}
	}
	
	static isTypeNumeric(type) {
		return type == VMObject.TYPE_INT || type == VMObject.TYPE_FLOAT
	}
	
	static isTypeNumericOrPtr(type) {
		return type == VMObject.TYPE_INT || type == VMObject.TYPE_FLOAT || type == VMObject.TYPE_PTR
	}

	static CONVERT_TABLE = {
		[VMObject.TYPE_NULL]:  "convertNull",
		[VMObject.TYPE_INT]:   "convertInt",
		[VMObject.TYPE_FLOAT]: "convertFloat",
		[VMObject.TYPE_PTR]:   "convertPtr",
		[VMObject.TYPE_EXT]:   "convertExt"
	}

	type = VMObject.TYPE_NULL
	value = null

	constructor(vm) {
		this.vm = vm
	}
	
	getValueOrString(maxLength) {
		return this.type == VMObject.TYPE_PTR ? this.readString(maxLength) : this.getValue()
	}

	getValue() {
		return this.value
	}

	setValue(value) {
		this.value = value
	}

	getData(value) {
		throw new VMError(`Tried to read internal data of non-int-representable object`)
	}

	setData(value) {
		throw new VMError(`Tried to write internal data of non-int-representable object`)
	}
	
	copy() {
		return this.vm.create(VMNull)
	}

	convert(type) {
		let converter = VMObject.CONVERT_TABLE[type]

		if (converter) {
			return this[converter]()
		} else {
			throw new VMError(`Tried to convert object to unrecognized type ${VMObject.getTypeName(type)}`)
		}
	}

	convertNull() {
		return this.vm.create(VMNull)
	}

	convertInt() {
		throw new VMError(`Tried to convert object of type ${VMObject.getTypeName(this.type)} to int`)
	}

	convertFloat() {
		throw new VMError(`Tried to convert object of type ${VMObject.getTypeName(this.type)} to float`)
	}

	convertPtr() {
		throw new VMError(`Tried to convert object of type ${VMObject.getTypeName(this.type)} to ptr`)
	}

	convertExt() {
		throw new VMError(`Tried to convert object of type ${VMObject.getTypeName(this.type)} to ext`)
	}

	reinterpret(type) {
		if (type == VMObject.TYPE_NULL) {
			return this.vm.create(VMNull)
		}

		if (VMObject.isTypeNumericOrPtr(type)) {
			let obj

			switch (type) {
				case VMObject.TYPE_INT:
					obj = this.vm.create(VMInt, 0)
					break
				
				case VMObject.TYPE_FLOAT:
					obj = this.vm.create(VMFloat, 0)
					break
				
				case VMObject.TYPE_PTR:
					obj = this.vm.create(VMPtr, this.type == VMObject.TYPE_PTR ? this.memory : this.vm.memory, 0)
					break
			}

			obj.setData(this.getData())
			return obj
		} else {
			throw new VMError(`Tried to reinterpret object of type ${VMObject.getTypeName(this.type)} as type ${VMObject.getTypeName(type)}`)
		}
	}
}

class VMNull extends VMObject {
	convertInt() {
		return this.vm.create(VMInt, 0)
	}

	convertFloat() {
		return this.vm.create(VMFloat, 0)
	}

	convertPtr() {
		return this.vm.create(VMPtr, this.vm.memory, 0)
	}
}

class VMInt extends VMObject {
	type = VMObject.TYPE_INT
	data = new DataView(new ArrayBuffer(4))

	constructor(vm, value) {
		super(vm)

		this.setValue(value)
	}

	getValue() {
		return this.data.getInt32(0)
	}

	setValue(value) {
		this.data.setInt32(0, value)
	}

	getData() {
		return this.data.getUint32(0)
	}

	setData(value) {
		this.data.setUint32(0, value)
	}
	
	copy() {
		return this.vm.create(VMInt, this.getValue())
	}

	convertInt() {
		return this.vm.create(VMInt, this.getValue())
	}

	convertFloat() {
		return this.vm.create(VMFloat, this.getValue())
	}

	convertPtr() {
		return this.vm.create(VMPtr, this.vm.memory, this.getValue())
	}
}

class VMFloat extends VMObject {
	type = VMObject.TYPE_FLOAT
	data = new DataView(new ArrayBuffer(4))

	constructor(vm, value) {
		super(vm)

		this.setValue(value)
	}

	getValue() {
		return this.data.getFloat32(0)
	}

	setValue(value) {
		this.data.setFloat32(0, value)
	}

	getData() {
		return this.data.getUint32(0)
	}

	setData(value) {
		this.data.setUint32(0, value)
	}
	
	copy() {
		return this.vm.create(VMFloat, this.getValue())
	}

	convertInt() {
		return this.vm.create(VMInt, this.getValue())
	}

	convertFloat() {
		return this.vm.create(VMFloat, this.getValue())
	}
}

class VMPtr extends VMObject {
	type = VMObject.TYPE_PTR
	data = new DataView(new ArrayBuffer(4))

	constructor(vm, memory, value) {
		super(vm)

		this.memory = memory
		this.setValue(value)
	}

	getValue() {
		return this.data.getUint32(0)
	}

	setValue(value) {
		this.data.setUint32(0, value)
	}

	getData() {
		return this.data.getUint32(0)
	}

	setData(value) {
		this.data.setUint32(0, value)
	}
	
	copy() {
		return this.vm.create(VMPtr, this.memory, this.getValue())
	}

	convertInt() {
		return this.vm.create(VMInt, this.getValue())
	}

	convertPtr() {
		return this.vm.create(VMPtr, this.memory, this.getValue())
	}

	read(offset) {
		return this.memory.read(this.getValue() + offset)
	}

	write(offset, obj) {
		return this.memory.write(this.getValue() + offset, obj)
	}
	
	readString(maxLength = Infinity) {
		if (!(this.memory instanceof VMIntMemory)) {
			throw new VMError(`Tried to read string from pointer to object memory`)
		}
		
		let data = []
		let view = new DataView(new ArrayBuffer(4))
		
		out: for (let i = 0; i < maxLength / 4; i++) {
			view.setUint32(0, this.read(i))
			
			for (let j = 0; j < 4; j++) {
				let val = view.getUint8(j)
				
				if (val == 0 || data.length >= maxLength) {
					break out
				} else {
					data.push(val)
				}
			}
		}
		
		return this.vm.decodeStringUtf8(Uint8Array.from(data), maxLength)
	}
}

class VMExt extends VMObject {
	type = VMObject.TYPE_EXT

	constructor(vm, value) {
		super(vm)
		
		this.setValue(value)
	}
	
	copy() {
		return this.vm.create(VMExt, this.getValue())
	}
}

class VMRegisters {
	static NUM_REGISTERS = 32
	
	static REG_ZERO = 0
	static REG_COMP = 1
	static REG_PC = 2
	static REG_P0 = 24
	static REG_P1 = 25
	static REG_IRSP = 26
	static REG_IPOP = 27
	static REG_IPTR = 28
	static REG_SP = 29
	static REG_PUSH = 30
	static REG_POP = 31
	
	static GETTER_TABLE = {
		[VMRegisters.REG_ZERO]: null,
		[VMRegisters.REG_COMP]: null,
		[VMRegisters.REG_PC]:   null,
		[VMRegisters.REG_P0]:   null,
		[VMRegisters.REG_P1]:   null,
		[VMRegisters.REG_IRSP]: null,
		[VMRegisters.REG_IPOP]: "getIpop",
		[VMRegisters.REG_IPTR]: "getIptr",
		[VMRegisters.REG_SP]:   null,
		[VMRegisters.REG_PUSH]: null,
		[VMRegisters.REG_POP]:  "getPop"
	}
	
	static SETTER_TABLE = {
		[VMRegisters.REG_ZERO]: "setZero",
		[VMRegisters.REG_COMP]: null,
		[VMRegisters.REG_PC]:   "setPc",
		[VMRegisters.REG_P0]:   null,
		[VMRegisters.REG_P1]:   null,
		[VMRegisters.REG_IRSP]: "setIrsp",
		[VMRegisters.REG_IPOP]: "setIpop",
		[VMRegisters.REG_IPTR]: "setIptr",
		[VMRegisters.REG_SP]:   "setSp",
		[VMRegisters.REG_PUSH]: "setPush",
		[VMRegisters.REG_POP]:  "setPop"
	}
	
	static REGISTER_NAMES = {
		"ZERO": VMRegisters.REG_ZERO,
		"COMP": VMRegisters.REG_COMP,
		"PC":   VMRegisters.REG_PC,
		"P0":   VMRegisters.REG_P0,
		"P1":   VMRegisters.REG_P1,
		"IRSP": VMRegisters.REG_IRSP,
		"IPOP": VMRegisters.REG_IPOP,
		"IPTR": VMRegisters.REG_IPTR,
		"SP":   VMRegisters.REG_SP,
		"PUSH": VMRegisters.REG_PUSH,
		"POP":  VMRegisters.REG_POP
	}
	
	registers = Object.seal(new Array(VMRegisters.NUM_REGISTERS).fill(0))

	constructor(vm) {
		this.vm = vm

		this.reset()
	}
	
	reset() {
		for (let i = 0; i < this.registers.length; i++) {
			if (this.registers[i] && (i == VMRegisters.REG_P0 || i == VMRegisters.REG_P1)) {
				continue
			}

			this.registers[i] = this.vm.create(VMNull)
		}
		
		this.registers[VMRegisters.REG_ZERO] = this.vm.create(VMInt, 0)
		this.registers[VMRegisters.REG_PC] = this.vm.create(VMPtr, this.vm.memory, 0)
		this.registers[VMRegisters.REG_IRSP] = this.vm.create(VMPtr, this.vm.irs, 0)
		this.registers[VMRegisters.REG_SP] = this.vm.create(VMPtr, this.vm.stack, 0)
	}
	
	get(num) {
		if (num < 0 || num >= VMRegisters.NUM_REGISTERS) {
			throw new VMError(`Tried to read invalid register $${num}`)
		}

		let getter = VMRegisters.GETTER_TABLE[num]
		
		if (getter) {
			return this[getter]()
		} else {
			return this.registers[num]
		}
	}
	
	set(num, obj) {
		if (num < 0 || num >= VMRegisters.NUM_REGISTERS) {
			throw new VMError(`Tried to write invalid register $${num}`)
		}

		if (!(obj instanceof VMObject)) {
			throw new VMError(`Tried to write an invalid object to register $${num}`)
		}

		let setter = VMRegisters.SETTER_TABLE[num]
		
		if (setter) {
			this[setter](obj)
		} else {
			this.registers[num] = obj
		}
	}
	
	setZero(obj) {
		// no-op
	}
	
	setPc(obj) {
		if (obj.type != VMObject.TYPE_PTR) {
			throw new VMError(`Tried to write a non-pointer to $PC`)
		}

		this.registers[VMRegisters.REG_PC] = obj
	}
	
	setIrsp(obj) {
		if (obj.type != VMObject.TYPE_PTR) {
			throw new VMError(`Tried to write a non-pointer to $IRSP`)
		}

		this.registers[VMRegisters.REG_IRSP] = obj
	}

	getIpop() {
		return this.vm.create(VMInt, this.vm.irsPop())
	}
	
	setIpop(obj) {
		throw new VMError(`Tried to write to $IPOP`)
	}

	getIptr() {
		return this.vm.create(VMPtr, this.vm.memory, this.vm.irsPop())
	}
	
	setIptr(obj) {
		throw new VMError(`Tried to write to $IPTR`)
	}
	
	setSp(obj) {
		if (obj.type != VMObject.TYPE_PTR) {
			throw new VMError(`Tried to write a non-pointer to $SP`)
		}

		this.registers[VMRegisters.REG_SP] = obj
	}
	
	setPush(obj) {
		this.vm.stackPush(obj)
		this.registers[VMRegisters.REG_PUSH] = obj
	}

	getPop() {
		return this.vm.stackPop()
	}
	
	setPop(obj) {
		throw new VMError(`Tried to write to $POP`)
	}
}

class VMIntMemory {
	constructor(vm, size) {
		this.vm = vm
		this.size = size
		this.data = new Int32Array(size)
	}

	read(addr) {
		if (addr < 0 || addr >= this.size) {
			throw new VMError(`Tried to read invalid address ${addr} of int memory region`)
		}

		return this.data[addr]
	}

	write(addr, num) {
		if (addr < 0 || addr >= this.size) {
			throw new VMError(`Tried to write invalid address ${addr} of int memory region`)
		}
		
		this.data[addr] = num
	}

	clear() {
		this.data.fill(0)
	}
}

class VMObjectMemory {
	constructor(vm, size) {
		this.vm = vm
		this.size = size
		this.data = Object.seal(new Array(size).fill(0))

		this.clear()
	}

	read(addr) {
		if (addr < 0 || addr >= this.size) {
			throw new VMError(`Tried to read invalid address ${addr} of object memory region`)
		}

		return this.data[addr]
	}

	write(addr, obj) {
		if (addr < 0 || addr >= this.size) {
			throw new VMError(`Tried to write invalid address ${addr} of object memory region`)
		}

		if (!(obj instanceof VMObject)) {
			throw new VMError(`Tried to write an invalid object to address ${addr} of object memory region`)
		}

		this.data[addr] = obj
	}

	clear() {
		for (let i = 0; i < this.data.length; i++) {
			this.data[i] = this.vm.create(VMNull)
		}
	}
}

class VMEnvFunction {
	constructor(args, func) {
		this.args = args
		this.func = func
	}
	
	call(vm, ...args) {
		return this.func(vm, ...args)
	}
}

class VM {
	static MAIN_MEMORY_SIZE = 0x1000000
	static STACK_SIZE = 0x10000
	static CALL_STACK_SIZE = 0x10000
	static IRS_SIZE = 0x10000
	
	static INSTR_CLASS_NOP  = 0b0000
	static INSTR_CLASS_EXIT = 0b0001
	static INSTR_CLASS_PUSH = 0b0010
	static INSTR_CLASS_POP  = 0b0011
	static INSTR_CLASS_RET  = 0b0100
	static INSTR_CLASS_ENV  = 0b0101
	static INSTR_CLASS_B    = 0b0110
	static INSTR_CLASS_CMP  = 0b0111
	static INSTR_CLASS_CVT  = 0b1000
	static INSTR_CLASS_NUM  = 0b1001
	static INSTR_CLASS_MEM  = 0b1010
	static INSTR_CLASS_SYS  = 0b1111

	static INSTR_CLASS_EXECS = {
		[VM.INSTR_CLASS_NOP]:  "execNop",
		[VM.INSTR_CLASS_EXIT]: "execExit",
		[VM.INSTR_CLASS_PUSH]: "execPush",
		[VM.INSTR_CLASS_POP]:  "execPop",
		[VM.INSTR_CLASS_RET]:  "execRet",
		[VM.INSTR_CLASS_ENV]:  "execEnv",
		[VM.INSTR_CLASS_B]:    "execB",
		[VM.INSTR_CLASS_CMP]:  "execCmp",
		[VM.INSTR_CLASS_CVT]:  "execCvt",
		[VM.INSTR_CLASS_NUM]:  "execNum",
		[VM.INSTR_CLASS_MEM]:  "execMem",
		[VM.INSTR_CLASS_SYS]:  "execSys",
	}
	
	encodeStringUtf8(str) {
		let data = new Uint8Array(str.length * 3 + 1)
		let { written } = this.textEncoder.encodeInto(str, data)
		
		let view = new DataView(data.buffer)
		let arr = new Uint32Array(Math.ceil((written + 1) / 4))
		
		for (let i = 0; i < arr.length; i++) {
			arr[i] = view.getUint32(i * 4)
		}
		
		return arr
	}
	
	decodeStringUtf8(arr, maxLength) {
		let len = Math.min(arr.length, maxLength)
		let data = []
		
		for (let i = 0; i < len; i++) {
			let val = arr[i]
			
			if (val == 0) {
				break
			} else {
				data.push(val)
			}
		}
		
		return this.textDecoder.decode(new Uint8Array(data))
	}

	constructor() {
		this.textEncoder = new TextEncoder()
		this.textDecoder = new TextDecoder("utf-8", { fatal: true })

		this.stopped = false
		this.branching = false
		this.exitValue = undefined

		this.registers = new VMRegisters(this)
		
		this.memory = new VMIntMemory(this, VM.MAIN_MEMORY_SIZE)
		this.stack = new VMObjectMemory(this, VM.STACK_SIZE)
		this.callStack = new VMIntMemory(this, VM.CALL_STACK_SIZE)
		this.irs = new VMIntMemory(this, VM.IRS_SIZE)
		
		this.csp = this.create(VMPtr, this.callStack, 0)
		
		this.env = {}

		this.reset()
	}

	reset() {
		this.cycles = 0
		this.stopped = false
		this.branching = false
		this.exitValue = undefined

		this.registers.reset()

		this.memory.clear()
		this.stack.clear()
		this.callStack.clear()
		this.irs.clear()
		
		this.csp.setValue(0)
	}

	create(cons, ...args) {
		return new cons(this, ...args)
	}

	readMemory(addr, type) {
		return this.create(VMInt, this.memory.read(addr)).reinterpret(type)
	}

	writeMemory(addr, obj) {
		if (!VMObject.isTypeNumericOrPtr(obj.type)) {
			throw new VMError(`Tried to write object of type ${VMObject.getTypeName(obj.type)} to memory`)
		}

		this.memory.write(addr, obj.getData())
	}
	
	getEnvironment(key, base) {
		let root = base ?? this.env
		return key in root ? root[key] : null
	}
	
	setEnvironment(key, value, base) {
		let root = base ?? this.env
		root[key] = value
	}

	stackPush(obj) {
		let sp = this.registers.get(VMRegisters.REG_SP)
		sp.write(0, obj)
		this.registers.set(VMRegisters.REG_SP, this.create(VMPtr, this.stack, sp.getValue() + 1))
	}

	stackPop() {
		let sp = this.create(VMPtr, this.stack, this.registers.get(VMRegisters.REG_SP).getValue() - 1)
		this.registers.set(VMRegisters.REG_SP, sp)
		return sp.read(0)
	}

	callStackPush() {
		this.csp.write(0, this.registers.get(VMRegisters.REG_PC).getValue() + 1)
		this.csp.setValue(this.csp.getValue() + 1)
	}

	callStackPop() {
		this.csp.setValue(this.csp.getValue() - 1)
		this.registers.set(VMRegisters.REG_PC, this.create(VMPtr, this.memory, this.csp.read(0)))
	}

	irsPush(num) {
		let irsp = this.registers.get(VMRegisters.REG_IRSP)
		irsp.write(0, num)
		this.registers.set(VMRegisters.REG_IRSP, this.create(VMPtr, this.irs, irsp.getValue() + 1))
	}

	irsPop() {
		let irsp = this.create(VMPtr, this.irs, this.registers.get(VMRegisters.REG_IRSP).getValue() - 1)
		this.registers.set(VMRegisters.REG_IRSP, irsp)
		return irsp.read(0)
	}
	
	loadProgram(buf) {
		this.reset()
		
		for (let i = 0; i < buf.length; i++) {
			this.memory.write(i, buf[i])
		}
	}
	
	run() {
		while (!this.stopped) {
			this.step()
		}
		
		return this.exitValue
	}
	
	step() {
		if (!this.stopped) {
			let pc = this.registers.get(VMRegisters.REG_PC)

			let instr = pc.read(0)
			this.executeInstruction(instr)

			if (!this.branching) {
				this.registers.set(VMRegisters.REG_PC, this.create(VMPtr, this.memory, pc.getValue() + 1))
			}
			
			this.branching = false
		}
		
		return this.exitValue
	}

	executeInstruction(instr) {
		debug(`CursedVM: Executing instruction ${(instr >>> 0).toString(16)} (PC ${this.registers.get(VMRegisters.REG_PC).getValue().toString(16).padStart(8, "0")})`)
		
		let instrClass = VM.INSTR_CLASS_EXECS[instr >>> 28]
		
		if (!instrClass) {
			throw new VMError(`Tried to execute instruction from reserved instruction class ${instrClass}`)
		}
		
		let s = (instr >>> 27) & 0b1
		let c0 = (instr >>> 24) & 0b111
		let c1 = (instr >>> 21) & 0b111
		let r0 = (instr >>> 16) & 0b11111
		let c2 = (instr >>> 13) & 0b111
		let r1 = (instr >>> 8) & 0b11111
		let c3 = (instr >>> 5) & 0b111
		let r2 = instr & 0b11111
		let imm = instr & 0xFFFF
		
		let data = new DataView(new ArrayBuffer(2))
		data.setInt16(0, imm)
		let immSigned = data.getInt16(0)

		if (this[instrClass](s, r0, r1, r2, c0, c1, c2, c3, imm, immSigned) && s) {
			this.irsPush(immSigned)
		}

		this.cycles++
	}
	
	execNop(s, r0, r1, r2, c0, c1, c2, c3, imm, immSigned) {
		return true
	}
	
	execExit(s, r0, r1, r2, c0, c1, c2, c3, imm, immSigned) {
		this.stopped = true

		if (c0 & 0b001) {
			this.exitValue = this.registers.get(r0)
		} else {
			this.exitValue = immSigned
		}
		
		return false
	}
	
	execPush(s, r0, r1, r2, c0, c1, c2, c3, imm, immSigned) {
		if (c0 & 0b001) {
			this.stackPush(this.registers.get(r0))
			return true
		} else {
			this.stackPush(this.create(VMInt, immSigned))
			return false
		}
	}
	
	execPop(s, r0, r1, r2, c0, c1, c2, c3, imm, immSigned) {
		if (c0 & 0b001) {
			this.registers.set(r0, this.create(c0 & 0b010 ? VMPtr : VMInt, this.irsPop()))
			return true
		} else {
			this.registers.set(r0, this.stackPop())
			return true
		}
	}
	
	execRet(s, r0, r1, r2, c0, c1, c2, c3, imm, immSigned) {
		this.callStackPop()
		this.branching = true
		
		return true
	}
	
	execEnv(s, r0, r1, r2, c0, c1, c2, c3, imm, immSigned) {
		let key = this.registers.get(r1).getValueOrString()
		
		let base = null
		
		if (c0 & 0b001) {
			let reg = this.registers.get(r2)
			
			if (reg.type != VMObject.TYPE_EXT) {
				throw new VMError(`Tried to get or set property of environment variable, but register was type ${VMObject.getTypeName(reg.type)} instead of ext`)
			}
			
			base = reg.getValue()
		}
		
		if (s) {
			let obj = this.registers.get(r0)
			this.setEnvironment(key, obj.getValueOrString(), base)
		} else {
			let val = this.getEnvironment(key, base)
			let result
			
			if (val != null) {
				if (c0 & 0b010) {
					result = this.create(VMExt, val)
				} else {
					val = Number(val)
					
					if (Number.isNaN(val)) {
						throw new VMError(`Tried to get environment variable "${key}" but value is NaN`)
					}
					
					result = this.create(VMFloat, val)
				}
			} else {
				result = this.create(VMNull)
			}
			
			this.registers.set(r0, result)
		}
		
		return false
	}
	
	execB(s, r0, r1, r2, c0, c1, c2, c3, imm, immSigned) {
		let branch = true
		
		if (c1 & 0b100) {
			let comp = this.registers.get(VMRegisters.REG_COMP)
			
			if (comp.type != VMObject.TYPE_INT) {
				throw new VMError(`Tried to do a conditional branch, but comparison result register was not an int`)
			}
			
			branch &&= comp.getValue()
		}
		
		let useRegister = c0 & 0b001
		
		if (branch) {
			let absolute = c0 & 0b010
			let call = c0 & 0b100
			
			if (call && !absolute) {
				throw new VMError(`Invalid relative call instruction`)
			}
			
			let target
			
			if (useRegister) {
				let reg = this.registers.get(r0)
				
				if (call && reg.type == VMObject.TYPE_EXT) {
					let func = reg.getValue()

					let argCount
					let ext
					
					if (func instanceof VMEnvFunction) {
						argCount = func.args
						ext = false
					} else if (func instanceof Function) {
						let obj = this.stackPop()
						
						if (obj.type != VMObject.TYPE_INT) {
							throw new VMError(`Expected int argument count for external call, got type ${VMObject.getTypeName(obj.type)}`)
						}
						
						argCount = obj.getValue()
						ext = true
					}
					
					let args = []
					
					for (let i = 0; i < argCount; i++) {
						let obj = this.stackPop()
						
						if (ext) {
							obj = obj.getValueOrString()
						}
						
						args.push(obj)
					}
					
					let res = func.call(this, ...args)
					
					if (res === undefined) {
						this.stackPush(this.create(VMNull))
					} else {
						this.stackPush(this.create(VMExt, res))
					}
					
					return useRegister
				}
				
				if (!(reg.type == VMObject.TYPE_INT || absolute && reg.type == VMObject.TYPE_PTR)) {
					throw new VMError(`Invalid register type ${VMObject.getTypeName(reg.type)} for branch. Branch type: ${c0}`)
				}
				
				target = reg.getValue()
			} else {
				target = immSigned
			}
			
			if (call) {
				this.callStackPush()
			}
			
			let pc = this.registers.get(VMRegisters.REG_PC)
			
			if (!absolute) {
				target += pc.getValue()
			}
			
			this.registers.set(VMRegisters.REG_PC, this.create(VMPtr, this.memory, target))
			this.branching = true
		}
		
		return useRegister
	}
	
	execCmp(s, r0, r1, r2, c0, c1, c2, c3, imm, immSigned) {
		let regMode = c1 & 0b001
		let destReg = regMode ? r1 : VMRegisters.REG_COMP

		let reg0 = this.registers.get(r0)
		let val0

		if (regMode) {
			if (c0 == 0b011) {
				this.registers.set(destReg, this.create(VMInt, reg0.type == VMObject.TYPE_NULL))
				return false
			}

			if (c0 == 0b111) {
				this.registers.set(destReg, this.create(VMInt, reg0.type != VMObject.TYPE_NULL))
				return false
			}
		}
		
		if (!VMObject.isTypeNumericOrPtr(reg0.type)) {
			throw new VMError(`Invalid register type ${VMObject.getTypeName(reg0.type)} for comparison`)
		}
		
		val0 = reg0.getValue()
		
		let reg1
		let val1
		
		if (regMode) {
			reg1 = this.registers.get(r2)
			
			if (!VMObject.isTypeNumericOrPtr(reg1.type)) {
				throw new VMError(`Invalid register type ${VMObject.getTypeName(reg1.type)} for comparison`)
			}
			
			if ((reg0.type == VMObject.TYPE_PTR) ^ (reg1.type == VMObject.TYPE_PTR)) {
				throw new VMError(`Cannot compare ${VMObject.getTypeName(reg0.type)} and ${VMObject.getTypeName(reg1.type)}`)
			}
			
			val1 = reg1.getValue()
		} else {
			if (c0 == 0b100) {
				this.registers.set(destReg, this.create(VMInt, !val0))
				return true
			}

			if (reg0.type == VMObject.TYPE_PTR) {
				throw new VMError(`Cannot compare ${VMObject.getTypeName(reg0.type)} and immediate`)
			}
			
			val1 = immSigned
		}
		
		if (reg0.type == VMObject.TYPE_PTR && reg1.type == VMObject.TYPE_PTR && reg0.memory != reg1.memory) {
			throw new VMError(`Cannot compare pointers to different memory regions`)
		}
		
		switch (c0) {
			case 0b000:
				this.registers.set(destReg, this.create(VMInt, val0 < val1 ? -1 : val0 > val1 ? 1 : 0))
				return false

			case 0b001:
				this.registers.set(destReg, this.create(VMInt, val0 == val1))
				return false

			case 0b010:
				this.registers.set(destReg, this.create(VMInt, val0 < val1))
				return false

			case 0b011:
				this.registers.set(destReg, this.create(VMInt, val0 > val1))
				return false

			case 0b100:
				this.registers.set(destReg, this.create(VMInt, reg0 == reg1))
				return false

			case 0b101:
				this.registers.set(destReg, this.create(VMInt, val0 != val1))
				return false

			case 0b110:
				this.registers.set(destReg, this.create(VMInt, val0 >= val1))
				return false

			case 0b111:
				this.registers.set(destReg, this.create(VMInt, val0 <= val1))
				return false
		}
	}

	execCvt(s, r0, r1, r2, c0, c1, c2, c3, imm, immSigned) {
		let regMode = c1 & 0b001
		
		if (c0 == VMObject.TYPE_NULL) {
			this.registers.set(r0, this.create(VMNull))
			return !regMode
		}
		
		if (regMode) {
			let srcObj = this.registers.get(r2)
			
			if (s) {
				srcObj = srcObj.reinterpret(r1)
			}
			
			this.registers.set(r0, srcObj.convert(c0))
		} else {
			switch (c0) {
				case VMObject.TYPE_INT:
					this.registers.set(r0, this.create(VMInt, immSigned))
					break
				
				case VMObject.TYPE_FLOAT:
					this.registers.set(r0, this.create(VMFloat, immSigned))
					break
				
				case VMObject.TYPE_PTR:
					this.registers.set(r0, this.create(VMPtr, this.memory, immSigned))
					break
				
				case VMObject.TYPE_EXT:
					throw new VMError(`Cannot convert object type to external object`)
				
				default:
					throw new VMError(`Tried to convert to unrecognized type ${VMObject.getTypeName(c0)}`)
			}
		}
		
		return false
	}
	
	execNum(s, r0, r1, r2, c0, c1, c2, c3, imm, immSigned) {
		let x = this.registers.get(r1)
		let y = this.registers.get(r2)
		
		let isAddSub = c0 < 0b010
		let isBitwise = c0 > 0b100
		
		// this might be one of the worst lines of code i have written in my life
		if ((!VMObject.isTypeNumeric(x.type) || !VMObject.isTypeNumeric(y.type) || isBitwise && (x.type != VMObject.TYPE_INT || y.type != VMObject.TYPE_INT)) && !(isAddSub && x.type == VMObject.TYPE_PTR && (y.type == VMObject.TYPE_INT || y.type == VMObject.TYPE_PTR))) {
			throw new VMError(`Invalid types for numeric operation: ${VMObject.getTypeName(x.type)}, ${VMObject.getTypeName(y.type)}`)
		}
		
		let v0 = x.getValue()
		let v1 = y.getValue()
		
		let res
		let makeFloat = false
		
		switch (c0) {
			case 0b000:
			case 0b001:
				if (c0 == 0b000) {
					res = v0 + v1
				} else {
					res = v0 - v1
				}
				
				if (s) {
					if (x.type == VMObject.TYPE_PTR) {
						throw new VMError(`Tried to store pointer additional result as float`)
					}
					
					makeFloat = true
				}
				
				break

			case 0b010:
				res = v0 * v1
				makeFloat = s
				break

			case 0b011:
				res = v0 / v1
				makeFloat = s
				break

			case 0b100:
				res = v0 % v1
				makeFloat = s
				break

			case 0b101:
				res = s ? v0 | v1 : v0 & v1
				break

			case 0b110:
				res = s ? ~(v0 ^ v1) : v0 ^ v1
				break

			case 0b111:
				res = s ? v0 >> v1 : v0 << v1
				break
		}
		
		if (makeFloat) {
			this.registers.set(r0, this.create(VMFloat, res))
		} else {
			let obj = x.copy()
			obj.setValue(res)
			this.registers.set(r0, obj)
		}
		
		return false
	}

	execMem(s, r0, r1, r2, c0, c1, c2, c3, imm, immSigned) {
		let ptr = this.registers.get(r1)

		if (ptr.type != VMObject.TYPE_PTR) {
			throw new VMError(`Cannot access memory from non-pointer object`)
		}

		let offset = this.registers.get(r2)

		if (offset.type != VMObject.TYPE_INT && offset.type != VMObject.TYPE_PTR) {
			throw new VMError(`Tried to access memory but offset was type ${VMObject.getTypeName(offset.type)}`)
		}

		let addr = ptr.getValue() + offset.getValue()

		if (s) {
			this.writeMemory(addr, this.registers.get(r0))
		} else {
			this.registers.set(r0, this.readMemory(addr, c0))
		}

		return false
	}
	
	execSys(s, r0, r1, r2, c0, c1, c2, c3, imm, immSigned) {
		if (!s && (c0 & 0b001)) {
			let reg = this.registers.get(r0)
			console.log(`${VMObject.getTypeName(reg.type)} ${reg.getValue()}`)
			return false
		}

		let entries = Object.entries(VMRegisters.REGISTER_NAMES)
		let sp = this.registers.get(VMRegisters.REG_SP).getValue()
		
		console.log([
			`call stack: ${this.callStack.data.slice(0, this.csp.getValue())}`,
			`registers:`,
			...this.registers.registers.map((e, i) => `- $${entries.find((e) => e[1] == i)?.[0] ?? i}: ${VMObject.getTypeName(e.type)} ${e.getValue()}`),
			`stack:`,
			...this.stack.data.slice(Math.max(0, sp - 16), sp).reverse().map((e, i) => `- ${VMObject.getTypeName(e.type)} ${e.getValue()}`)
		].join("\n"))
		
		
		if (s) {
			this.stopped = true
		}
		
		return false
	}
}

class VMBytecodeRelocation {
	constructor(rel, addr, label) {
		this.rel = rel
		this.addr = addr
		this.label = label
	}
}

class VMBytecodeObject {
	constructor(vm, data = [], labels = {}, relocations = []) {
		this.vm = vm
		
		this.data = data
		this.labels = labels
		this.relocations = relocations
		
		this.addr = 0
	}
	
	pushInt(num) {
		this.data[this.addr++] = num
	}
	
	pushFloat(num) {
		let data = new DataView(new ArrayBuffer(4))
		data.setFloat32(0, num)
		this.data[this.addr++] = data.getInt32(0)
	}
	
	pushString(str) {
		let data = this.vm.encodeStringUtf8(str)
		
		for (let i = 0; i < data.length; i++) {
			this.data[this.addr++] = data[i]
		}
	}
	
	addLabel(name, offset = 0) {
		if (name in this.labels) {
			throw new Error(`Duplicate label "${name}"`)
		}
		
		this.labels[name] = this.addr + offset
	}
	
	addRelocation(rel, name, offset = 0) {
		this.relocations.push(new VMBytecodeRelocation(rel, this.addr + offset, name))
	}
	
	apply(func, ...args) {
		func.apply(this, args)
	}
}

class VMAssemblerOp {
	constructor(encoding, irs, args) {
		this.encoding = encoding.split("").filter((e) => e != " ")
		this.irs = irs
		this.args = args
	}
}

class VMAssembler {
	// why am i doing this like this
	static OPS = {
		"ipush":            new VMAssemblerOp("????1??? ???????? AAAAAAAA AAAAAAAA", false, ["#A"]),
		"nop":              new VMAssemblerOp("0000S??? ???????? AAAAAAAA AAAAAAAA", true,  []),
		"exit.i":           new VMAssemblerOp("0001???0 ???????? AAAAAAAA AAAAAAAA", false, ["#A"]),
		"exit.r":           new VMAssemblerOp("0001???1 ???RRRRR ???????? ????????", false, ["$R"]),
		"push.i":           new VMAssemblerOp("0010???0 ???????? AAAAAAAA AAAAAAAA", false, ["#A"]),
		"push.r":           new VMAssemblerOp("0010S??1 ???RRRRR AAAAAAAA AAAAAAAA", true,  ["$R"]),
		"pop":              new VMAssemblerOp("0011S??0 ???RRRRR AAAAAAAA AAAAAAAA", true,  ["$R"]),
		"ipop.int":         new VMAssemblerOp("0011S?01 ???RRRRR AAAAAAAA AAAAAAAA", true,  ["$R"]),
		"ipop.ptr":         new VMAssemblerOp("0011S?11 ???RRRRR AAAAAAAA AAAAAAAA", true,  ["$R"]),
		"ret":              new VMAssemblerOp("0100S??? ???????? AAAAAAAA AAAAAAAA", true,  []),
		"get":              new VMAssemblerOp("01010?00 ???YYYYY ???XXXXX ????????", false, ["$Y", "$X"]),
		"getp":             new VMAssemblerOp("01010?01 ???YYYYY ???XXXXX ???ZZZZZ", false, ["$Y", "$Z", "$X"]),
		"load":             new VMAssemblerOp("01010?10 ???YYYYY ???XXXXX ????????", false, ["$Y", "$X"]),
		"loadp":            new VMAssemblerOp("01010?11 ???YYYYY ???XXXXX ???ZZZZZ", false, ["$Y", "$Z", "$X"]),
		"set":              new VMAssemblerOp("01011??0 ???YYYYY ???XXXXX ????????", false, ["$X", "$Y"]),
		"setp":             new VMAssemblerOp("01011??1 ???YYYYY ???XXXXX ???ZZZZZ", false, ["$Z", "$X", "$Y"]),
		"b.i":              new VMAssemblerOp("0110?000 0??????? AAAAAAAA AAAAAAAA", false, ["#A"]),
		"b.r":              new VMAssemblerOp("0110S001 0??RRRRR AAAAAAAA AAAAAAAA", true,  ["$R"]),
		"b.abs.i":          new VMAssemblerOp("0110?010 0??????? AAAAAAAA AAAAAAAA", false, ["#A"]),
		"b.abs.r":          new VMAssemblerOp("0110S011 0??RRRRR AAAAAAAA AAAAAAAA", true,  ["$R"]),
		"call.i":           new VMAssemblerOp("0110S110 0??????? AAAAAAAA AAAAAAAA", true,  ["#A"]),
		"call.r":           new VMAssemblerOp("0110S111 0??RRRRR AAAAAAAA AAAAAAAA", true,  ["$R"]),
		"bc.i":             new VMAssemblerOp("0110?000 1??????? AAAAAAAA AAAAAAAA", false, ["#A"]),
		"bc.r":             new VMAssemblerOp("0110S001 1??RRRRR AAAAAAAA AAAAAAAA", true,  ["$R"]),
		"bc.abs.i":         new VMAssemblerOp("0110?010 1??????? AAAAAAAA AAAAAAAA", false, ["#A"]),
		"bc.abs.r":         new VMAssemblerOp("0110S011 1??RRRRR AAAAAAAA AAAAAAAA", true,  ["$R"]),
		"callc.i":          new VMAssemblerOp("0110S110 1??????? AAAAAAAA AAAAAAAA", true,  ["#A"]),
		"callc.r":          new VMAssemblerOp("0110S111 1??RRRRR AAAAAAAA AAAAAAAA", true,  ["$R"]),
		"c.cmp.i":          new VMAssemblerOp("0111S000 ??0XXXXX AAAAAAAA AAAAAAAA", false, ["$X", "#A"]),
		"c.eq.i":           new VMAssemblerOp("0111S001 ??0XXXXX AAAAAAAA AAAAAAAA", false, ["$X", "#A"]),
		"c.lt.i":           new VMAssemblerOp("0111S010 ??0XXXXX AAAAAAAA AAAAAAAA", false, ["$X", "#A"]),
		"c.gt.i":           new VMAssemblerOp("0111S011 ??0XXXXX AAAAAAAA AAAAAAAA", false, ["$X", "#A"]),
		"c.not":            new VMAssemblerOp("0111S100 ??0XXXXX AAAAAAAA AAAAAAAA", true,  ["$X"]),
		"c.neq.i":          new VMAssemblerOp("0111S101 ??0XXXXX AAAAAAAA AAAAAAAA", false, ["$X", "#A"]),
		"c.gte.i":          new VMAssemblerOp("0111S110 ??0XXXXX AAAAAAAA AAAAAAAA", false, ["$X", "#A"]),
		"c.lte.i":          new VMAssemblerOp("0111S111 ??0XXXXX AAAAAAAA AAAAAAAA", false, ["$X", "#A"]),
		"c.cmp.r":          new VMAssemblerOp("0111?000 ??1XXXXX ???YYYYY ???ZZZZZ", false, ["$Y", "$X", "$Z"]),
		"c.eq.r":           new VMAssemblerOp("0111?001 ??1XXXXX ???YYYYY ???ZZZZZ", false, ["$Y", "$X", "$Z"]),
		"c.lt.r":           new VMAssemblerOp("0111?010 ??1XXXXX ???YYYYY ???ZZZZZ", false, ["$Y", "$X", "$Z"]),
		"c.null":           new VMAssemblerOp("0111?011 ??1XXXXX ???YYYYY ????????", false, ["$Y", "$X"]),
		"c.same":           new VMAssemblerOp("0111?100 ??1XXXXX ???YYYYY ???ZZZZZ", false, ["$Y", "$X", "$Z"]),
		"c.neq.r":          new VMAssemblerOp("0111?101 ??1XXXXX ???YYYYY ???ZZZZZ", false, ["$Y", "$X", "$Z"]),
		"c.gte.r":          new VMAssemblerOp("0111?110 ??1XXXXX ???YYYYY ???ZZZZZ", false, ["$Y", "$X", "$Z"]),
		"c.nnull":          new VMAssemblerOp("0111?111 ??1XXXXX ???YYYYY ????????", false, ["$Y", "$X"]),
		"cvt.null.i":       new VMAssemblerOp("1000S000 ??0YYYYY AAAAAAAA AAAAAAAA", true,  ["$Y", "#A"]),
		"cvt.int.i":        new VMAssemblerOp("1000S001 ??0YYYYY AAAAAAAA AAAAAAAA", false, ["$Y", "#A"]),
		"cvt.float.i":      new VMAssemblerOp("1000S010 ??0YYYYY AAAAAAAA AAAAAAAA", false, ["$Y", "#A"]),
		"cvt.ptr.i":        new VMAssemblerOp("1000S011 ??0YYYYY AAAAAAAA AAAAAAAA", false, ["$Y", "#A"]),
		"cvt.ext.i":        new VMAssemblerOp("1000S100 ??0YYYYY AAAAAAAA AAAAAAAA", false, ["$Y", "#A"]),
		"cvt.null.r":       new VMAssemblerOp("10000000 ??1YYYYY ???????? ???XXXXX", false, ["$Y", "$X"]),
		"cvt.int.r":        new VMAssemblerOp("10000001 ??1YYYYY ???????? ???XXXXX", false, ["$Y", "$X"]),
		"cvt.float.r":      new VMAssemblerOp("10000010 ??1YYYYY ???????? ???XXXXX", false, ["$Y", "$X"]),
		"cvt.ptr.r":        new VMAssemblerOp("10000011 ??1YYYYY ???????? ???XXXXX", false, ["$Y", "$X"]),
		"cvt.ext.r":        new VMAssemblerOp("10000100 ??1YYYYY ???????? ???XXXXX", false, ["$Y", "$X"]),
		"repr.null.null":   new VMAssemblerOp("10001000 ??1YYYYY ???00000 ???XXXXX", false, ["$Y", "$X"]),
		"repr.null.int":    new VMAssemblerOp("10001001 ??1YYYYY ???00000 ???XXXXX", false, ["$Y", "$X"]),
		"repr.null.float":  new VMAssemblerOp("10001010 ??1YYYYY ???00000 ???XXXXX", false, ["$Y", "$X"]),
		"repr.null.ptr":    new VMAssemblerOp("10001011 ??1YYYYY ???00000 ???XXXXX", false, ["$Y", "$X"]),
		"repr.null.ext":    new VMAssemblerOp("10001100 ??1YYYYY ???00000 ???XXXXX", false, ["$Y", "$X"]),
		"repr.int.null":    new VMAssemblerOp("10001000 ??1YYYYY ???00001 ???XXXXX", false, ["$Y", "$X"]),
		"repr.int.int":     new VMAssemblerOp("10001001 ??1YYYYY ???00001 ???XXXXX", false, ["$Y", "$X"]),
		"repr.int.float":   new VMAssemblerOp("10001010 ??1YYYYY ???00001 ???XXXXX", false, ["$Y", "$X"]),
		"repr.int.ptr":     new VMAssemblerOp("10001011 ??1YYYYY ???00001 ???XXXXX", false, ["$Y", "$X"]),
		"repr.int.ext":     new VMAssemblerOp("10001100 ??1YYYYY ???00001 ???XXXXX", false, ["$Y", "$X"]),
		"repr.float.null":  new VMAssemblerOp("10001000 ??1YYYYY ???00010 ???XXXXX", false, ["$Y", "$X"]),
		"repr.float.int":   new VMAssemblerOp("10001001 ??1YYYYY ???00010 ???XXXXX", false, ["$Y", "$X"]),
		"repr.float.float": new VMAssemblerOp("10001010 ??1YYYYY ???00010 ???XXXXX", false, ["$Y", "$X"]),
		"repr.float.ptr":   new VMAssemblerOp("10001011 ??1YYYYY ???00010 ???XXXXX", false, ["$Y", "$X"]),
		"repr.float.ext":   new VMAssemblerOp("10001100 ??1YYYYY ???00010 ???XXXXX", false, ["$Y", "$X"]),
		"repr.ptr.null":    new VMAssemblerOp("10001000 ??1YYYYY ???00011 ???XXXXX", false, ["$Y", "$X"]),
		"repr.ptr.int":     new VMAssemblerOp("10001001 ??1YYYYY ???00011 ???XXXXX", false, ["$Y", "$X"]),
		"repr.ptr.float":   new VMAssemblerOp("10001010 ??1YYYYY ???00011 ???XXXXX", false, ["$Y", "$X"]),
		"repr.ptr.ptr":     new VMAssemblerOp("10001011 ??1YYYYY ???00011 ???XXXXX", false, ["$Y", "$X"]),
		"repr.ptr.ext":     new VMAssemblerOp("10001100 ??1YYYYY ???00011 ???XXXXX", false, ["$Y", "$X"]),
		"repr.ext.null":    new VMAssemblerOp("10001000 ??1YYYYY ???00100 ???XXXXX", false, ["$Y", "$X"]),
		"repr.ext.int":     new VMAssemblerOp("10001001 ??1YYYYY ???00100 ???XXXXX", false, ["$Y", "$X"]),
		"repr.ext.float":   new VMAssemblerOp("10001010 ??1YYYYY ???00100 ???XXXXX", false, ["$Y", "$X"]),
		"repr.ext.ptr":     new VMAssemblerOp("10001011 ??1YYYYY ???00100 ???XXXXX", false, ["$Y", "$X"]),
		"repr.ext.ext":     new VMAssemblerOp("10001100 ??1YYYYY ???00100 ???XXXXX", false, ["$Y", "$X"]),
		"add":              new VMAssemblerOp("10010000 ???ZZZZZ ???XXXXX ???YYYYY", false, ["$Z", "$X", "$Y"]),
		"add.f":            new VMAssemblerOp("10011000 ???ZZZZZ ???XXXXX ???YYYYY", false, ["$Z", "$X", "$Y"]),
		"sub":              new VMAssemblerOp("10010001 ???ZZZZZ ???XXXXX ???YYYYY", false, ["$Z", "$X", "$Y"]),
		"sub.f":            new VMAssemblerOp("10011001 ???ZZZZZ ???XXXXX ???YYYYY", false, ["$Z", "$X", "$Y"]),
		"mult":             new VMAssemblerOp("10010010 ???ZZZZZ ???XXXXX ???YYYYY", false, ["$Z", "$X", "$Y"]),
		"mult.f":           new VMAssemblerOp("10011010 ???ZZZZZ ???XXXXX ???YYYYY", false, ["$Z", "$X", "$Y"]),
		"div":              new VMAssemblerOp("10010011 ???ZZZZZ ???XXXXX ???YYYYY", false, ["$Z", "$X", "$Y"]),
		"div.f":            new VMAssemblerOp("10011011 ???ZZZZZ ???XXXXX ???YYYYY", false, ["$Z", "$X", "$Y"]),
		"mod":              new VMAssemblerOp("10010100 ???ZZZZZ ???XXXXX ???YYYYY", false, ["$Z", "$X", "$Y"]),
		"mod.f":            new VMAssemblerOp("10011100 ???ZZZZZ ???XXXXX ???YYYYY", false, ["$Z", "$X", "$Y"]),
		"and":              new VMAssemblerOp("10010101 ???ZZZZZ ???XXXXX ???YYYYY", false, ["$Z", "$X", "$Y"]),
		"or":               new VMAssemblerOp("10011101 ???ZZZZZ ???XXXXX ???YYYYY", false, ["$Z", "$X", "$Y"]),
		"xor":              new VMAssemblerOp("10010110 ???ZZZZZ ???XXXXX ???YYYYY", false, ["$Z", "$X", "$Y"]),
		"xnor":             new VMAssemblerOp("10011110 ???ZZZZZ ???XXXXX ???YYYYY", false, ["$Z", "$X", "$Y"]),
		"shl":              new VMAssemblerOp("10010111 ???ZZZZZ ???XXXXX ???YYYYY", false, ["$Z", "$X", "$Y"]),
		"shr":              new VMAssemblerOp("10011111 ???ZZZZZ ???XXXXX ???YYYYY", false, ["$Z", "$X", "$Y"]),
		"read.null":        new VMAssemblerOp("10100000 ???ZZZZZ ???XXXXX ???YYYYY", false, ["$Z", "$X", "$Y"]),
		"read.int":         new VMAssemblerOp("10100001 ???ZZZZZ ???XXXXX ???YYYYY", false, ["$Z", "$X", "$Y"]),
		"read.float":       new VMAssemblerOp("10100010 ???ZZZZZ ???XXXXX ???YYYYY", false, ["$Z", "$X", "$Y"]),
		"read.ptr":         new VMAssemblerOp("10100011 ???ZZZZZ ???XXXXX ???YYYYY", false, ["$Z", "$X", "$Y"]),
		"read.ext":         new VMAssemblerOp("10100100 ???ZZZZZ ???XXXXX ???YYYYY", false, ["$Z", "$X", "$Y"]),
		"write":            new VMAssemblerOp("10101??? ???ZZZZZ ???XXXXX ???YYYYY", false, ["$Z", "$X", "$Y"]),
		"dbg":              new VMAssemblerOp("11110??0 ???????? ???????? ????????", false, []),
		"dbgp":             new VMAssemblerOp("11110??1 ???XXXXX ???????? ????????", false, ["$X"]),
		"break":            new VMAssemblerOp("11111??? ???????? ???????? ????????", false, []),
	}
	
	static DIRECTIVE_METHODS = {
		"int":    "directiveInt",
		"float":  "directiveFloat",
		"ptr":    "directivePtr",
		"utf8":   "directiveUtf8",
		"string": "directiveUtf8",
		"str":    "directiveUtf8"
	}
	
	static isIdentifier(str) {
		return /^[A-Za-z_][A-Za-z0-9_]+?$/.test(str)
	}
	
	constructor(vm) {
		this.vm = vm
	}
	
	// too lazy to do proper tokenizing
	assemble(code) {
		code = this.preprocess(code)
		
		let line = []
		
		let lastNum = 0
		let lastIrs = false
		
		let textObj = this.vm.create(VMBytecodeObject)
		let rodataObj = this.vm.create(VMBytecodeObject)
		
		for (let i = 0; i < code.length; i++) {
			let chr = code[i]
			
			if ((chr == ";" || chr == "\n") && line.length) {
				line = line.filter((e) => e)
				
				let [command, ...args] = line
				
				if (command.endsWith(":")) {
					let labelName = command.slice(0, command.length - 1)
					
					if (!VMAssembler.isIdentifier(labelName)) {
						throw new Error(`Invalid label name "${labelName}"`)
					}
					
					textObj.addLabel(labelName)

					line = []
					continue
				}

				for (let j = 0; j < args.length; j++) {
					if (args[j][0] == "\"" || args[j].startsWith("F#")) {
						let labelName = "__RODATA_" + (Math.random() * 0x10000000 | 0).toString(16)

						rodataObj.addLabel(labelName)

						if (args[j][0] == "\"") {
							rodataObj.apply(this.directiveUtf8, [args[j]])
						} else {
							rodataObj.apply(this.directiveFloat, [args[j].replace("F#", "#")])
						}
						
						args[j] = "&" + labelName
					}
					
					if (args[j][0] == "&" || args[j][0] == "^") {
						textObj.addRelocation(args[j][0] == "^", args[j].slice(1))
						args[j] = "#0"
					}
				}
				
				if (command.startsWith(".")) {
					let directiveName = command.slice(1)
					
					if (!VMAssembler.isIdentifier(directiveName)) {
						throw new Error(`Invalid directive name "${directiveName}"`)
					}
					
					let methodName = VMAssembler.DIRECTIVE_METHODS[directiveName]
					
					if (!methodName) {
						throw new Error(`Unrecognized directive "${directiveName}"`)
					}
					
					textObj.apply(this[methodName], args)
				} else {
					let ipush = command == "ipush"
					
					if (ipush) {
						if (!lastIrs) {
							throw new Error(`Could not apply ipush`)
						}
						
						textObj.addr--
					}
					
					let op = VMAssembler.OPS[command]
					
					if (!op) {
						throw new Error(`Unrecognized instruction "${command}"`)
					}
					
					if (args.length != op.args.length) {
						throw new Error(`Expected ${op.args.length} args for instruction "${command}", got ${args.length}`)
					}
					
					let values = {}
					
					for (let j = 0; j < args.length; j++) {
						let type = args[j][0] == "$" ? "register" : args[j][0] == "#" ? "immediate" : "unknown"
						let expectedType = op.args[j][0] == "$" ? "register" : op.args[j][0] == "#" ? "immediate" : "unknown"
						
						if (type != expectedType) {
							throw new Error(`Expected argument type ${expectedType} for argument ${j + 1} of instruction "${command}", got type ${type}`)
						}
						
						let ident = args[j].slice(1)
						let target = op.args[j].slice(1)
						
						if (!Number.isNaN(Number(ident))) {
							ident = Number(ident)
						} else if (type == "register") {
							if (ident in VMRegisters.REGISTER_NAMES) {
								ident = VMRegisters.REGISTER_NAMES[ident]
							} else {
								throw new Error(`Unrecognized register identifier ${args[j]}`)
							}
						} else {
							throw new Error(`Unrecognized immediate value ${args[j]}`)
						}
						
						values[target] = { i: 0, value: (ident >>> 0).toString(2).padStart(op.encoding.filter((e) => e == target).length, "0") }
					}
					
					let bits = op.encoding.slice()
					
					let substrate = 0
					let num = 0
					
					if (ipush) {
						values["S"] = { i: 0, value: "1" }
						substrate = lastNum
					}
					
					for (let j = 0; j < bits.length; j++) {
						num <<= 1
						substrate = (substrate << 1) | (substrate >>> 31)
						
						if (bits[j] in values) {
							let obj = values[bits[j]]
							num |= +obj.value[obj.i++]
						} else {
							switch (bits[j]) {
								case "0":
									break
								
								case "1":
									num |= 1
									break
								
								default:
									num |= substrate & 1
									break
							}
						}
					}
					
					textObj.pushInt(num)
					
					lastNum = num
					lastIrs = op.irs
				}
				
				line = []
				continue
			}
			
			if (/\s/.test(chr)) {
				if (line.length == 1) {
					line.push("")
				}
				
				continue
			}
			
			if (chr == "," && line.length > 1) {
				line.push("")
				continue
			}
			
			if (chr == "\"") {
				let str = ""
				let escaped = false
				
				while (true) {
					str += code[i]
					
					if (str.length > 1 && !escaped && code[i] == "\"") {
						break
					}
					
					if (code[i] == "\n" || i == code.length - 1) {
						throw new Error(`Unterminated string`)
					}
					
					if (!escaped && code[i] == "\\") {
						escaped = true
					} else {
						escaped = false
					}
					
					i++
				}
				
				if (line[line.length - 1] && line[line.length - 1].length > 0) {
					line.push(str)
				} else {
					line[line.length - 1] = str
				}
				
				continue
			}
			
			if (line.length == 0) {
				line.push(chr)
			} else {
				line[line.length - 1] += chr
			}
		}
		
		return [textObj, rodataObj]
	}
	
	preprocess(code) {
		code = code.replace(/\/\/.+$/gm, "").split("\n")
		
		let macros = code.filter((line) => line.trim().startsWith("DEFINE"))
		code = code.filter((line) => !macros.includes(line)).join("\n")
		
		for (let i = macros.length - 1; i >= 0; i--) {
			let [decl, search, ...replace] = macros[i].trim().split(/\s+/)
			replace = replace.join(" ")
			
			if (decl == "DEFINE") {
				code = code.replaceAll("[" + search + "]", replace)
			} else if (decl == "DEFINEX") {
				let groups = search.match(/^\((\w+)((?:;\?\w+)*)\)$/)
				
				if (groups == null) {
					throw new Error(`Syntax error in macro declaration "${search}"`)
				}
				
				let [_, tag, params] = groups
				params = params.split(";").slice(1)
				
				code = code.replace(new RegExp("\\[" + tag + "\\]" + "\\s+([^\\s;]+)".repeat(params.length), "g"), (_, ...args) => {
					let str = replace
					
					for (let i = 0; i < args.length; i++) {
						str = str.replaceAll(params[i], args[i])
					}
					
					return str
				})
			} else {
				throw new Error(`Unrecognized macro declaration "${decl}"`)
			}
		}

		return code
	}
	
	directiveInt(args) {
		for (let i = 0; i < args.length; i++) {
			let str = args[i].startsWith("#") ? args[i].slice(1) : args[i]
			let num = Number(str)
			
			if (!Number.isInteger(num)) {
				throw new Error(`Unrecognized integer value ${str}`)
			}
			
			this.pushInt(num)
		}
	}
	
	directiveFloat(args) {
		for (let i = 0; i < args.length; i++) {
			let str = args[i].startsWith("#") ? args[i].slice(1) : args[i]
			let num = Number(str)
			
			if (Number.isNaN(num)) {
				throw new Error(`Unrecognized integer value ${str}`)
			}
			
			this.pushFloat(num)
		}
	}
	
	directivePtr(args) {
		for (let i = 0; i < args.length; i++) {
			let str = args[i].startsWith("#") ? args[i].slice(1) : args[i]
			let num = Number(str)
			
			if (!Number.isInteger(num)) {
				throw new Error(`Unrecognized integer value ${str}`)
			}
			
			this.pushInt(num)
		}
	}
	
	directiveUtf8(args) {
		this.pushString(JSON.parse(args[0]))
	}
}

class VMLinker {
	constructor(vm) {
		this.vm = vm
	}
	
	link(...objects) {
		objects = objects.flat()
		
		let obj = this.vm.create(VMBytecodeObject)
		
		for (let i = 0; i < objects.length; i++) {
			for (let label in objects[i].labels) {
				obj.addLabel(label, objects[i].labels[label])
			}
			
			for (let j = 0; j < objects[i].relocations.length; j++) {
				let reloc = objects[i].relocations[j]
				obj.addRelocation(reloc.rel, reloc.label, reloc.addr)
			}
			
			for (let j = 0; j < objects[i].data.length; j++) {
				obj.pushInt(objects[i].data[j])
			}
		}
		
		for (let i = 0; i < obj.relocations.length; i++) {
			let reloc = obj.relocations[i]
			
			let labelAddr = obj.labels[reloc.label]
			
			if (labelAddr == undefined) {
				throw new Error(`Couldn't find label "${obj.relocations[i].label}"`)
			}
			
			if (reloc.rel) {
				labelAddr -= reloc.addr
			}
			
			obj.data[reloc.addr] &= ~0xFFFF
			obj.data[reloc.addr] |= labelAddr & 0xFFFF
		}
		
		return obj
	}
}

let vm = new VM()
vm.setEnvironment("", globalThis)
vm.setEnvironment("vmbind", new VMEnvFunction(2, (vm, obj1, obj2) => obj1.getValue().bind(obj2.getValue())))

globalThis["new"] = (cons, ...args) => new cons(...args)

let assembler = vm.create(VMAssembler)
let linker = vm.create(VMLinker)

let code = `	
	DEFINE at $3
	
	DEFINE s0 $4
	DEFINE s1 $5
	DEFINE s2 $6
	DEFINE s3 $7
	DEFINE s4 $8
	DEFINE s5 $9
	DEFINE s6 $10
	DEFINE s7 $11
	DEFINE s8 $12
	DEFINE s9 $13
	
	DEFINE t0 $14
	DEFINE t1 $15
	DEFINE t2 $16
	DEFINE t3 $17
	DEFINE t4 $18
	DEFINE t5 $19
	DEFINE t6 $20
	DEFINE t7 $21
	DEFINE t8 $22
	DEFINE t9 $23

	DEFINEX (GETPI;?a;?b;?c) cvt.ptr.i [at], ?c; getp ?a, ?b, [at]
	DEFINEX (LOADI;?a;?b) cvt.ptr.i [at], ?b; load ?a, [at]
	DEFINEX (LOADPI;?a;?b;?c) cvt.ptr.i [at], ?c; loadp ?a, ?b, [at]
	DEFINEX (SETPI;?a;?c;?b) cvt.ptr.i [at], ?c; setp ?a, [at], ?b
	
	DEFINE vmbind [s9]
	[LOADI] [vmbind] "vmbind"
	
	DEFINEX (LOADPI_BIND;?a;?b;?c) push.r ?b; pop $PUSH; cvt.ptr.i [at], ?c; loadp $PUSH, $PUSH, [at]; call.r [vmbind]; pop ?a

	DEFINE window [s8]
	load [window], $IRSP
	
	DEFINE document [s7]
	[LOADPI] [document] [window] "document"

    DEFINE getElementById [s6]
    [LOADPI_BIND] [getElementById] [document] "getElementById"

    DEFINE createElement [s5]
    [LOADPI_BIND] [createElement] [document] "createElement"

    DEFINE name [s4]
    cvt.ptr.i $PUSH, "name"
    push.i #1
    call.r [getElementById]
    pop [name]

    DEFINE email [s3]
    cvt.ptr.i $PUSH, "email"
    push.i #1
    call.r [getElementById]
    pop [email]

    DEFINE msg [s2]
    cvt.ptr.i $PUSH, "msg"
    push.i #1
    call.r [getElementById]
    pop [msg]

    DEFINE users [s1]
    cvt.ptr.i $PUSH, "users"
    push.i #1
    call.r [getElementById]
    pop [users]

    DEFINE new [s0]
    [LOADPI_BIND] [new] [window] "new"

    [LOADPI_BIND] [t0] $POP "preventDefault"
    push.r $ZERO
    call.r [t0]

    [LOADPI_BIND] [t0] [msg] "replaceChildren"
    push.r $ZERO
    call.r [t0]
    
    [LOADPI] $PUSH [email] "value"
    [LOADPI] $PUSH [window] "String"
    push.i #2
    call.r [new]
    pop $PUSH
    [GETPI] [t0] $PUSH "length"
    c.not [t0]
    bc.i ^error

    cvt.ptr.i $PUSH, " : "

    [LOADPI] $PUSH [name] "value"
    [LOADPI] $PUSH [window] "String"
    push.i #2
    call.r [new]
    pop $PUSH
    [GETPI] [t0] $PUSH "length"
    c.not [t0]
    bc.i ^error

    cvt.ptr.i $PUSH, "li"
    push.i #1
    call.r [createElement]

    pop [t0]
    [LOADPI_BIND] [t1] [t0] "append"
    push.i #3
    call.r [t1]

    [LOADPI_BIND] [t1] [users] "append"
    push.r [t0]
    push.i #1
    call.r [t1]

    [SETPI] [name] "value" $IRSP
    [SETPI] [email] "value" $IRSP

    exit.i #1

error:
    cvt.ptr.i $PUSH, "div"
    push.i #1
    call.r [createElement]

    pop [t0]
    [LOADPI_BIND] [t1] [t0] "append"
    cvt.ptr.i $PUSH, "Please enter all fields"
    push.i #1
    call.r [t1]
    
    [LOADPI] [t1] [t0] "classList"
    [LOADPI_BIND] [t1] [t1] "add"
    cvt.ptr.i $PUSH, "error"
    push.i #1
    call.r [t1]

    [LOADPI_BIND] [t1] [msg] "append"
    push.r [t0]
    push.i #1
    call.r [t1]

    [LOADPI_BIND] [t0] [t0] "remove"
    [LOADPI_BIND] [t1] [window] "setTimeout"
    push.i #3000
    push.r [t0]
    push.i #2
    call.r [t1]

	exit.i #0
`

let objects = assembler.assemble(code)
let executable = linker.link(objects)

let form = document.getElementById("my-form")

form.addEventListener("submit", (evt) => {
    vm.loadProgram(executable.data)
    vm.stackPush(vm.create(VMExt, evt))

    let startTime = performance.now()
    vm.run()
    let timeTaken = performance.now() - startTime
    let execSpeed = vm.cycles * 1000 / timeTaken

    console.log(`Exit value:`, vm.exitValue)
    console.log(`Inst count:`, vm.cycles)
    console.log(`Time taken:`, timeTaken.toFixed(3) + "ms")
    console.log(`Exec speed:`, execSpeed.toFixed(3) + "Hz")
})