import fs from 'fs';
import path from 'path';
import compiler from '@vue/compiler-dom';
import { Defined } from '@poolofdeath20/util';

const components = [
	{
		path: 'ui/buttons/primary-btn',
		name: 'PrimaryBtn',
		usage: 'primary-btn',
	},
	{
		path: 'ui/buttons/plain-btn',
		name: 'PlainBtn',
		usage: 'plain-btn',
	},
	{
		path: 'ui/buttons/plain-icon-btn',
		name: 'PlainIconBtn',
		usage: 'plain-icon-btn',
	},
	{
		path: 'ui/buttons/outline-btn',
		name: 'OutlineBtn',
		usage: 'outline-btn',
	},
	{
		path: 'ui/buttons/outline-icon-btn',
		name: 'OutlineIconBtn',
		usage: 'outline-icon-btn',
	},
	{
		path: 'ui/buttons/primary-icon-btn',
		name: 'PrimaryIconBtn',
		usage: 'primary-icon-btn',
	},
	{
		path: 'ui/radio-button',
		name: 'RadioButton',
		usage: 'radio-btn',
	},
	{
		path: 'ui/segmented-button',
		name: 'SegmentedButton',
		usage: 'segmented-button',
	},
	{
		path: 'ui/search',
		name: 'Search',
		usage: 'search-field',
	},
	{
		path: 'ui/callout',
		name: 'Callout',
		usage: 'callout',
	},
	{
		path: 'ui/icon',
		name: 'Icon',
		usage: 'icon',
	},
	{
		path: 'ui/text-area',
		name: 'TextArea',
		usage: 'text-area',
	},
	{
		path: 'ui/button',
		name: 'Btn',
		usage: 'btn',
	},
	{
		path: 'ui/divider',
		name: 'Divider',
		usage: 'divider',
	},
	{
		path: 'ui/color-picker',
		name: 'ColorPicker',
		usage: 'color-picker',
	},
	{
		path: 'ui/dialogs/content-dialog',
		name: 'ContentDialog',
		usage: 'base-dialog',
	},
	{
		path: 'ui/dialogs/alert-dialog',
		name: 'AlertDialog',
		usage: 'alert-dialog',
	},
	{
		path: 'ui/dialogs/unsaved-dialog',
		name: 'UnsavedDialog',
		usage: 'unsaved-dialog',
	},
	{
		path: 'ui/typography/CardTitle',
		name: 'CardTitle',
		usage: 'card-title',
	},
	{
		path: 'ui/typography/PageTitle',
		name: 'PageTitle',
		usage: 'page-title',
	},
	{
		path: 'ui/typography/Subtitle',
		name: 'Subtitle',
		usage: 'subtitle',
	},
	{
		path: 'ui/typography/TextBox',
		name: 'TextBox',
		usage: 'text-box',
	},
	{
		path: 'ui/typography/BoldTextBox',
		name: 'BoldTextBox',
		usage: 'bold-text-box',
	},
	{
		path: 'ui/progress-bar',
		name: 'progress',
		usage: 'progressBar',
	},
	{
		path: 'ui/pagination',
		name: 'Pagination',
		usage: 'pagination-row',
	},
	{
		path: 'ui/table',
		name: 'DataTable',
		usage: 'data-table',
	},
] as const;

const separator = '/';

type Strings = ReadonlyArray<string>;

const getAllVueFiles = (directory: string): Strings => {
	return fs.readdirSync(directory).flatMap((file) => {
		const filePath = path.posix.join(
			directory.split(path.sep).join(separator),
			file
		);

		if (fs.statSync(filePath).isDirectory()) {
			return getAllVueFiles(filePath);
		}

		return !filePath.endsWith('.vue') ? [] : [filePath];
	});
};

const readCode = (file: string) => {
	return new Promise<string>((resolve, reject) => {
		const code = [] as string[];

		fs.createReadStream(file)
			.on('data', (data) => {
				code.push(data.toString());
			})
			.on('end', () => {
				resolve(code.join(''));
			})
			.on('error', reject);
	});
};

const getAllVueCode = (files: Strings) => {
	return Promise.all(
		files.map(async (file) => {
			const code = await readCode(file);

			return {
				code,
				file,
				parsed: compiler.parse(code),
			};
		})
	);
};

const getJsCode = (node: compiler.RootNode) => {
	const scripts = node.children.flatMap((child) => {
		if (child.type !== compiler.NodeTypes.ELEMENT) {
			return [];
		}

		if (child.tag !== 'script') {
			return [];
		}

		return [child];
	});

	if (!scripts.length) {
		return [];
	}

	const setupScript = scripts.find((script) => {
		return script.props.find((prop) => {
			return prop.name === 'setup';
		});
	});

	if (setupScript) {
		return setupScript.children.flatMap((child) => {
			if (child.type !== compiler.NodeTypes.TEXT) {
				return [];
			}

			return [
				{
					type: 'composition' as const,
					location: child.loc,
					imports: child.content
						.split('\n')
						.filter((line) => line.startsWith('import')),
				},
			];
		});
	}

	return Defined.parse(scripts.at(0))
		.orThrow(new Error('No script found'))
		.children.flatMap((child) => {
			if (child.type !== compiler.NodeTypes.TEXT) {
				return [];
			}

			const codes = child.content.split('\n');

			const hasComponents = codes.find((line) =>
				line.includes('components: {')
			);

			if (!hasComponents) {
				return [];
			}

			return [
				{
					type: 'optional' as const,
					location: child.loc,
					imports: codes.filter((line) => line.startsWith('import')),
				},
			];
		});
};

type JsCode = ReturnType<typeof getJsCode>[0];

const getAllComponentTags = (
	node: compiler.ElementNode | compiler.RootNode
): Strings => {
	return node.children.flatMap((child) => {
		if (child.type !== compiler.NodeTypes.ELEMENT) {
			return [];
		}

		if (!child.children) {
			return [child.tag];
		}

		return [child.tag].concat(getAllComponentTags(child));
	});
};

const findReturnInSetup = (code: Strings, index: number): number => {
	if (
		Defined.parse(code.at(index))
			.orThrow(new Error('No code found'))
			.includes('return {')
	) {
		return index;
	}

	return findReturnInSetup(code, index + 1);
};

const isDirectory = (path: string) => {
	try {
		return fs.lstatSync(path).isDirectory();
	} catch (error) {
		return false;
	}
};

const getFileName = (path: string) => {
	const resolvePath = `${process.cwd()}/src/app/${path}`;

	if (isDirectory(resolvePath)) {
		return `${path}/index.vue`;
	}

	return `${path}.vue`;
};

const main = async () => {
	const files = getAllVueFiles('src');
	const codes = await getAllVueCode(files);
	codes
		.map((code) => {
			return {
				file: code.file,
				code: code.code,
				tags: getAllComponentTags(code.parsed),
				jsCode: getJsCode(code.parsed),
			};
		})
		.flatMap((code) => {
			const globalComponents = components.filter((component) => {
				return code.tags.find((tag) => {
					return component.usage === tag;
				});
			});

			const [importNeeded] = code.jsCode.flatMap((jsCode: JsCode) => {
				const importsNeeded = globalComponents.flatMap((component) => {
					return jsCode.imports.find((importLine) => {
						return (
							importLine.includes(component.path) ||
							importLine.includes(component.name)
						);
					})
						? []
						: [component];
				});

				if (!importsNeeded.length) {
					return [];
				}

				return [
					{
						type: jsCode.type,
						location: jsCode.location,
						importsNeeded,
					},
				];
			});

			if (!importNeeded) {
				return [];
			}

			return [
				{
					file: code.file,
					code: code.code,
					importNeeded,
				},
			];
		})
		.map((tag) => {
			const code = tag.code.split('\n');

			switch (tag.importNeeded.type) {
				case 'composition': {
					const newCode = code
						.flatMap((line, index) => {
							if (
								index === tag.importNeeded.location.start.line
							) {
								const dlsImportsStatement =
									tag.importNeeded.importsNeeded.map(
										(importLine) => {
											return `import ${importLine.name} from '@${getFileName(
												importLine.path
											)}'`;
										}
									);

								return dlsImportsStatement.concat(line);
							}

							return line;
						})
						.join('\n');

					return {
						file: tag.file,
						newCode,
					};
				}
				case 'optional': {
					const componentIndex = code.findIndex((line) => {
						return line.includes('components: {');
					});

					const newCode = code
						.flatMap((line, index) => {
							if (
								index === tag.importNeeded.location.start.line
							) {
								const dlsImportsStatement =
									tag.importNeeded.importsNeeded.map(
										(importLine) => {
											return `import ${importLine.name} from '@${getFileName(
												importLine.path
											)}'`;
										}
									);

								return dlsImportsStatement.concat(line);
							}

							if (index === componentIndex) {
								const [_, ...otherComponents] = Defined.parse(
									code.at(index)
								)
									.orThrow(new Error('No components found'))
									.split('{');

								const componentName =
									tag.importNeeded.importsNeeded.map(
										(importLine) => {
											return importLine.name;
										}
									);

								return `components: { ${[componentName, otherComponents].join()}`;
							}

							return line;
						})
						.join('\n');

					return {
						file: tag.file,
						newCode,
					};
				}
			}
		})
		.forEach(({ file, newCode }) => {
			fs.writeFileSync(file, newCode);
		});
};

main();
