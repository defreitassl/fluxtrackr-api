import { registerDecorator, type ValidationOptions } from 'class-validator';

const DECIMAL_12_2_PATTERN = /^-?\d+(?:\.\d{1,2})?$/;

/** Valida o domínio decimal aceito pelo banco sem converter para `number`. */
export function isDecimal12_2(value: unknown): boolean {
  if (typeof value !== 'string' || !DECIMAL_12_2_PATTERN.test(value)) {
    return false;
  }

  const unsigned = value.startsWith('-') ? value.slice(1) : value;
  const [integerPart] = unsigned.split('.');
  return integerPart.replace(/^0+(?=\d)/, '').length <= 10;
}

export function IsDecimal12_2(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'isDecimal12_2',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate: isDecimal12_2,
        defaultMessage: () => 'must be a Decimal(12,2) value',
      },
    });
}
