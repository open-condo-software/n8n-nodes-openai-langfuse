module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	testEnvironmentOptions: {
		experimentalVmModules: true,
	},
	roots: ['<rootDir>'],
	testMatch: ['**/__tests__/**/*.test.ts', '**/*.test.ts'],
	collectCoverageFrom: [
		'nodes/**/*.ts',
		'credentials/**/*.ts',
		'utils/**/*.ts',
		'!**/*.d.ts',
		'!**/dist/**',
		'!**/node_modules/**',
	],
	coverageThreshold: {
		global: {
			branches: 70,
			functions: 70,
			lines: 70,
			statements: 70,
		},
	},
	moduleNameMapper: {
		'^@/(.*)$': '<rootDir>/$1',
	},
	transform: {
		'^.+\\.ts$': ['ts-jest', {
			tsconfig: {
				esModuleInterop: true,
				allowSyntheticDefaultImports: true,
			},
		}],
	},
};
