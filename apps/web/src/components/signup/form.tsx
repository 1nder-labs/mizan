/**
 * Sign-up form for fresh accounts and invited reviewers.
 */
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { SignupSchema, type SignupInput } from "@mizan/shared";
import { authClient } from "@/lib/auth-client.ts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form.tsx";
import { Input } from "@/components/ui/input.tsx";

interface SignupFormProps {
  readonly defaultEmail?: string;
  readonly emailReadonly?: boolean;
  readonly onAuthenticated: () => Promise<void> | void;
}

async function submitSignup(values: SignupInput): Promise<string | null> {
  const { error } = await authClient.signUp.email({
    email: values.email,
    password: values.password,
    name: values.name,
  });
  return error?.message ?? null;
}

function SignupPasswordField({
  form,
}: {
  readonly form: UseFormReturn<SignupInput>;
}): React.JSX.Element {
  return (
    <FormField
      control={form.control}
      name="password"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Password</FormLabel>
          <FormControl>
            <Input type="password" autoComplete="new-password" {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function SignupFields({
  form,
  emailReadonly,
}: {
  readonly form: UseFormReturn<SignupInput>;
  readonly emailReadonly: boolean;
}): React.JSX.Element {
  return (
    <>
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Name</FormLabel>
            <FormControl>
              <Input autoComplete="name" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="email"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Email</FormLabel>
            <FormControl>
              <Input
                type="email"
                autoComplete="email"
                readOnly={emailReadonly}
                spellCheck={false}
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <SignupPasswordField form={form} />
    </>
  );
}

export function SignupForm({
  defaultEmail = "",
  emailReadonly = false,
  onAuthenticated,
}: SignupFormProps): React.JSX.Element {
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<SignupInput>({
    resolver: zodResolver(SignupSchema),
    defaultValues: { name: "", email: defaultEmail, password: "" },
    mode: "onTouched",
  });

  async function onSubmit(values: SignupInput): Promise<void> {
    setServerError(null);
    const errorMessage = await submitSignup(values);
    if (errorMessage) {
      setServerError(errorMessage);
      return;
    }
    await onAuthenticated();
  }

  return (
    <>
      {serverError ? (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>Could not create account</AlertTitle>
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      ) : null}
      <Form {...form}>
        <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <SignupFields form={form} emailReadonly={emailReadonly} />
          <Button type="submit" className="mt-2 w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? (
              <>
                <LoaderCircle className="mr-2 size-4 animate-spin" />
                Creating account
              </>
            ) : (
              "Create account"
            )}
          </Button>
        </form>
      </Form>
    </>
  );
}
