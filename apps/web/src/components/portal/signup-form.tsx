/**
 * Portal sign-up form. RHF + zodResolver over `SignupSchema`.
 * Submits with `signupKind: "client"` so the server assigns the
 * client role. On success calls `onAuthenticated`; server errors
 * surface in a destructive Alert above the form, mirroring
 * `components/signup/form.tsx`.
 */
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useForm, type UseFormReturn } from "react-hook-form";
import { SignupSchema, type SignupInput } from "@mizan/shared";
import { authClient } from "@/lib/auth-client.ts";
import { COPY } from "@/lib/copy-constants.ts";
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

interface PortalSignupFormProps {
  readonly onAuthenticated: () => Promise<void> | void;
}

async function submitPortalSignup(values: SignupInput): Promise<string | null> {
  const { error } = await authClient.signUp.email({
    email: values.email,
    password: values.password,
    name: values.name,
    signupKind: "client",
  });
  return error?.message ?? null;
}

function PortalSignupFields({
  form,
}: {
  readonly form: UseFormReturn<SignupInput>;
}): React.JSX.Element {
  return (
    <>
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{COPY.portal.signupName}</FormLabel>
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
            <FormLabel>{COPY.portal.signupEmail}</FormLabel>
            <FormControl>
              <Input type="email" autoComplete="email" spellCheck={false} {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="password"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{COPY.portal.signupPassword}</FormLabel>
            <FormControl>
              <Input type="password" autoComplete="new-password" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
}

export function PortalSignupForm({ onAuthenticated }: PortalSignupFormProps): React.JSX.Element {
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<SignupInput>({
    resolver: zodResolver(SignupSchema),
    defaultValues: { name: "", email: "", password: "" },
    mode: "onTouched",
  });

  async function onSubmit(values: SignupInput): Promise<void> {
    setServerError(null);
    const err = await submitPortalSignup(values);
    if (err) {
      setServerError(err);
      return;
    }
    await onAuthenticated();
  }

  return (
    <>
      {serverError ? (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>{COPY.portal.signupError}</AlertTitle>
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      ) : null}
      <Form {...form}>
        <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <PortalSignupFields form={form} />
          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                {COPY.portal.signupPending}
              </>
            ) : (
              COPY.portal.signupSubmit
            )}
          </Button>
        </form>
      </Form>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        {COPY.portal.signupHaveAccount}{" "}
        <Link to="/login" className="underline underline-offset-4 hover:text-foreground">
          {COPY.portal.signupLogin}
        </Link>
      </p>
    </>
  );
}
