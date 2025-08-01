import { AuthLayout } from '@/components/auth-layout'
import { Button } from '@/components/button'
import { Checkbox, CheckboxField } from '@/components/checkbox'
import { Field, Label } from '@/components/fieldset'
import { Heading } from '@/components/heading'
import { Input } from '@/components/input'
import { Strong, Text, TextLink } from '@/components/text'
import { Logo } from './logo'
import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { login } from '../services/auth';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  // Al montar, pedimos la página de login para obtener la cookie CSRF
  useEffect(() => {
    api.get('/accounts/login/').catch(() => {
      /* no nos importa la respuesta, solo la cookie */
    });
  }, []);w

  const handleSubmit = async e => {
    e.preventDefault();
    try {
      await login(username, password);
      window.location.href = '/carga-datos';
    } catch {
      setError('Usuario o contraseña inválidos');
    }
  };
  
  return (
    <AuthLayout>
      <form action="#" method="POST" className="grid w-full max-w-sm grid-cols-1 gap-8">
        <Logo className="h-6 text-zinc-950 dark:text-white forced-colors:text-[CanvasText]" />
        <Heading>Sign in to your account</Heading>
        <Field>
          <Label>Email</Label>
          <Input type="email" name="email" />
        </Field>
        <Field>
          <Label>Password</Label>
          <Input type="password" name="password" />
        </Field>
        <div className="flex items-center justify-between">
          <CheckboxField>
            <Checkbox name="remember" />
            <Label>Remember me</Label>
          </CheckboxField>
          <Text>
            <TextLink href="#">
              <Strong>Forgot password?</Strong>
            </TextLink>
          </Text>
        </div>
        <Button type="submit" className="w-full">
          Login
        </Button>
        <Text>
          Don’t have an account?{' '}
          <TextLink href="#">
            <Strong>Sign up</Strong>
          </TextLink>
        </Text>
      </form>
    </AuthLayout>
  );
}
