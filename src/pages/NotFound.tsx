import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center">
        <h1 className="mb-4 text-6xl font-bold text-primary">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">Страница не найдена</p>
        <Button asChild>
          <Link to="/">
            <Home className="h-4 w-4 mr-2" />
            Вернуться на главную
          </Link>
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
