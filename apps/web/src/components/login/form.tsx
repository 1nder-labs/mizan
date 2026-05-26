/**
 * Login form — RHF + zod + better-auth signin. Server errors surface
 * in a sibling Alert above the form so they don't shadow field-level
 * RHF messages. On success the parent's onAuthenticated callback
 * invalidates the session cache and navigates the user to /queue.
 */
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { LoginSchema, type LoginInput } from "@mizan/shared";
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

interface LoginFormProps {
  readonly onAuthenticated: () => Promise<void> | void;
}

function EmailField({ form }: { readonly form: UseFormReturn<LoginInput> }): React.JSX.Element {
  return (
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
              spellCheck={false}
              placeholder="reviewer@launchgood.com"
              {...field}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function PasswordField({ form }: { readonly form: UseFormReturn<LoginInput> }): React.JSX.Element {
  return (
    <FormField
      control={form.control}
      name="password"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Password</FormLabel>
          <FormControl>
            <Input type="password" autoComplete="current-password" {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function SubmitButton({ pending }: { readonly pending: boolean }): React.JSX.Element {
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="mr-2 size-4 animate-spin" />
          Signing in
        </>
      ) : (
        "Sign in"
      )}
    </Button>
  );
}

export function LoginForm({ onAuthenticated }: LoginFormProps): React.JSX.Element {
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<LoginInput>({
    resolver: zodResolver(LoginSchema),
    defaultValues: { email: "", password: "" },
    mode: "onTouched",
  });

  async function onSubmit(values: LoginInput): Promise<void> {
    setServerError(null);
    const { error } = await authClient.signIn.email({
      email: values.email,
      password: values.password,
    });
    if (error) {
      setServerError(error.message ?? "Sign-in failed");
      return;
    }
    await onAuthenticated();
  }

  return (
    <>
      {serverError ? (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>Could not sign in</AlertTitle>
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      ) : null}
      <Form {...form}>
        <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <EmailField form={form} />
          <PasswordField form={form} />
          <SubmitButton pending={form.formState.isSubmitting} />
        </form>
      </Form>
    </>
  );
}
